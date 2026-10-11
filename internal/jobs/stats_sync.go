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
	requestDelay = 200 * time.Millisecond
	syncInterval = 6 * time.Hour
)

// FlexFloat handles MLB API returning numbers as either JSON strings or JSON
// numbers. Valid is false when the field is missing or holds one of the
// API's placeholders for an undefined stat (e.g. ERA with 0 IP).
type FlexFloat struct {
	Value float64
	Valid bool
}

func (f *FlexFloat) UnmarshalJSON(data []byte) error {
	*f = FlexFloat{}

	// Try as JSON number first
	var num float64
	if err := json.Unmarshal(data, &num); err == nil {
		*f = FlexFloat{Value: num, Valid: true}
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
		return nil
	}

	val, err := strconv.ParseFloat(str, 64)
	if err != nil {
		return fmt.Errorf("cannot parse %q as float64: %w", str, err)
	}
	*f = FlexFloat{Value: val, Valid: true}
	return nil
}

// Ptr returns the value, or nil if it isn't set.
func (f FlexFloat) Ptr() *float64 {
	if !f.Valid {
		return nil
	}
	v := f.Value
	return &v
}

// mlbAPIBase is a var so tests can point it at a fake server.
var mlbAPIBase = "https://statsapi.mlb.com/api/v1"

type MLBStatsResponse struct {
	Stats []struct {
		Type struct {
			DisplayName string `json:"displayName"`
		} `json:"type"`
		Group struct {
			DisplayName string `json:"displayName"`
		} `json:"group"`
		Splits []struct {
			Team *struct {
				Name string `json:"name"`
			} `json:"team"`
			Stat struct {
				WAR         FlexFloat `json:"war"`
				ERA         FlexFloat `json:"era"`
				GamesPlayed int       `json:"gamesPlayed"`
			} `json:"stat"`
		} `json:"splits"`
	} `json:"stats"`
}

type MLBPeopleResponse struct {
	People []struct {
		ID         int64  `json:"id"`
		FullName   string `json:"fullName"`
		CurrentAge int    `json:"currentAge"`
	} `json:"people"`
}

// seasonStats is one season of a player's stats.
type seasonStats struct {
	Season int
	WAR    float64
	ERA    *float64
}

func RunStatsSync(s *store.Store, players []models.Player) error {
	log.Println("Starting stats sync...")
	season := time.Now().Year()
	for i, p := range players {
		// Rate limiting
		if i > 0 {
			time.Sleep(requestDelay)
		}

		age, err := fetchPlayerAge(p.MLBID)
		if err != nil {
			log.Printf("  Warning: failed to fetch age for %s (mlb_id=%d): %v", p.Name, p.MLBID, err)
			continue
		}

		time.Sleep(requestDelay)
		stats, err := fetchLatestStats(p.MLBID, season)
		if err != nil {
			log.Printf("  Warning: failed to fetch stats for %s (mlb_id=%d): %v", p.Name, p.MLBID, err)
			continue
		}

		p.Age = age
		p.Season = stats.Season
		p.WAR = stats.WAR
		p.ERA = stats.ERA
		if err := s.UpsertPlayer(&p); err != nil {
			log.Printf("  Warning: failed to save player %s: %v", p.Name, err)
			continue
		}

		log.Printf("  Synced: %s (age=%d, season=%d, war=%.1f)", p.Name, p.Age, p.Season, p.WAR)
	}
	log.Println("Stats sync complete")
	return nil
}

// fetchLatestStats returns stats for the given season, falling back to the
// previous season when the player has none yet (e.g. during the offseason).
// If neither season has data, it returns empty stats with Season set to 0.
func fetchLatestStats(mlbID int64, season int) (*seasonStats, error) {
	stats, err := fetchSeasonStats(mlbID, season)
	if err != nil || stats != nil {
		return stats, err
	}

	time.Sleep(requestDelay)
	stats, err = fetchSeasonStats(mlbID, season-1)
	if err != nil || stats != nil {
		return stats, err
	}
	return &seasonStats{}, nil
}

// fetchSeasonStats returns a player's stats for one season, or nil if the
// API has no data for that season.
func fetchSeasonStats(mlbID int64, season int) (*seasonStats, error) {
	url := fmt.Sprintf("%s/people/%d/stats?stats=season&group=hitting,pitching&season=%d",
		mlbAPIBase, mlbID, season)

	var statsResp MLBStatsResponse
	if err := getJSON(url, &statsResp); err != nil {
		return nil, err
	}

	var result *seasonStats
	for _, statGroup := range statsResp.Stats {
		if statGroup.Type.DisplayName != "season" {
			continue
		}
		// Traded players get one split per team plus a season total
		// (the split with no team). Prefer the total.
		idx := -1
		for i, split := range statGroup.Splits {
			if split.Team == nil {
				idx = i
				break
			}
		}
		if idx == -1 && len(statGroup.Splits) > 0 {
			idx = 0
		}
		if idx == -1 {
			continue
		}

		if result == nil {
			result = &seasonStats{Season: season}
		}
		stat := statGroup.Splits[idx].Stat
		switch statGroup.Group.DisplayName {
		case "hitting":
			result.WAR = stat.WAR.Value
		case "pitching":
			result.ERA = stat.ERA.Ptr()
		}
	}
	return result, nil
}

func fetchPlayerAge(mlbID int64) (int, error) {
	var peopleResp MLBPeopleResponse
	if err := getJSON(fmt.Sprintf("%s/people/%d", mlbAPIBase, mlbID), &peopleResp); err != nil {
		return 0, err
	}
	if len(peopleResp.People) == 0 {
		return 0, fmt.Errorf("no person found for mlb_id=%d", mlbID)
	}
	return peopleResp.People[0].CurrentAge, nil
}

func getJSON(url string, v any) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("MLB API returned %d: %s", resp.StatusCode, string(body))
	}
	return json.NewDecoder(resp.Body).Decode(v)
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
