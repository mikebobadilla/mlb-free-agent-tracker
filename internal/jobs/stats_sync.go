package jobs

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mlb-tracker/internal/models"
	"mlb-tracker/internal/store"
	"net/http"
	"strconv"
	"time"
)

const (
	mlbAPIBase   = "https://statsapi.mlb.com/api/v1"
	requestDelay = 200 * time.Millisecond
	syncInterval = 6 * time.Hour
)

// FlexFloat handles MLB API returning numbers as either JSON strings or JSON numbers.
type FlexFloat float64

func (f *FlexFloat) UnmarshalJSON(data []byte) error {
	// Try as JSON number first
	var num float64
	if err := json.Unmarshal(data, &num); err == nil {
		*f = FlexFloat(num)
		return nil
	}

	// Try as JSON string
	var str string
	if err := json.Unmarshal(data, &str); err != nil {
		return fmt.Errorf("cannot unmarshal %s as float64 or string", string(data))
	}

	// Placeholders the API uses when a rate stat is undefined (e.g. 0 IP)
	switch str {
	case "", "-", ".---", "-.--", "*.**":
		*f = 0
		return nil
	}

	val, err := strconv.ParseFloat(str, 64)
	if err != nil {
		return fmt.Errorf("cannot parse %q as float64: %w", str, err)
	}
	*f = FlexFloat(val)
	return nil
}

type MLBStatsResponse struct {
	Stats []struct {
		Type struct {
			DisplayName string `json:"displayName"`
		} `json:"type"`
		Group struct {
			DisplayName string `json:"displayName"`
		} `json:"group"`
		Splits []struct {
			Stat struct {
				WAR         FlexFloat `json:"war"`
				ERA         FlexFloat `json:"era"`
				GamesPlayed int       `json:"gamesPlayed"`
			} `json:"stat"`
		} `json:"splits"`
	} `json:"stats"`
}

type MLBSearchResponse struct {
	People []struct {
		ID       int64  `json:"id"`
		FullName string `json:"fullName"`
		Age      int    `json:"currentAge"`
	} `json:"people"`
}

func RunStatsSync(s *store.Store, players []models.Player) error {
	log.Println("Starting stats sync...")
	for i, p := range players {
		// Rate limiting
		if i > 0 {
			time.Sleep(requestDelay)
		}

		stats, err := fetchPlayerStats(p.MLBID)
		if err != nil {
			log.Printf("  Warning: failed to fetch stats for %s (mlb_id=%d): %v", p.Name, p.MLBID, err)
			continue
		}

		p.Age = stats.Age
		p.WAR = stats.WAR
		p.ERA = stats.ERA
		if err := s.UpsertPlayer(&p); err != nil {
			log.Printf("  Warning: failed to save player %s: %v", p.Name, err)
			continue
		}

		log.Printf("  Synced: %s (age=%d, war=%.1f)", p.Name, p.Age, p.WAR)
	}
	log.Println("Stats sync complete")
	return nil
}

func fetchPlayerStats(mlbID int64) (*struct {
	Age int
	WAR float64
	ERA *float64
}, error) {
	url := fmt.Sprintf("%s/people/%d/stats?stats=season,career&group=hitting,pitching&season=%d",
		mlbAPIBase, mlbID, time.Now().Year())

	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("MLB API returned %d: %s", resp.StatusCode, string(body))
	}

	var statsResp MLBStatsResponse
	if err := json.NewDecoder(resp.Body).Decode(&statsResp); err != nil {
		return nil, err
	}

	result := &struct {
		Age int
		WAR float64
		ERA *float64
	}{Age: 0, WAR: 0}

	// Extract career stats from the response
	for _, statGroup := range statsResp.Stats {
		if statGroup.Type.DisplayName == "career" {
			if len(statGroup.Splits) > 0 {
				split := statGroup.Splits[0].Stat
				if statGroup.Group.DisplayName == "hitting" {
					result.WAR = float64(split.WAR)
				} else if statGroup.Group.DisplayName == "pitching" {
					era := float64(split.ERA)
					result.ERA = &era
				}
			}
		}
	}

	return result, nil
}

func StartBackgroundSync(s *store.Store, players []models.Player) {
	go func() {
		ticker := time.NewTicker(syncInterval)
		defer ticker.Stop()

		// Run once on startup
		if err := RunStatsSync(s, players); err != nil {
			log.Printf("Initial stats sync error: %v", err)
		}

		for range ticker.C {
			if err := RunStatsSync(s, players); err != nil {
				log.Printf("Scheduled stats sync error: %v", err)
			}
		}
	}()
}
