package jobs

import (
	"fmt"
	"log"
	"mlb-tracker/internal/models"
	"mlb-tracker/internal/store"
	"time"
)

const contractWatchInterval = 30 * time.Minute

// MLBTransaction represents a single transaction from the MLB Stats API.
type MLBTransaction struct {
	ID     int64 `json:"id"`
	ToTeam *struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
	} `json:"toTeam"`
	Date        string `json:"date"`
	TypeCode    string `json:"typeCode"`
	TypeDesc    string `json:"typeDesc"`
	Description string `json:"description"`
}

// MLBTransactionsResponse is the response from /api/v1/transactions.
type MLBTransactionsResponse struct {
	Transactions []MLBTransaction `json:"transactions"`
}

// RunContractWatch checks all unsigned players for free agent signings.
func RunContractWatch(s *store.Store, players []models.Player) error {
	log.Println("Starting contract watch...")
	for i, p := range players {
		if i > 0 {
			time.Sleep(requestDelay)
		}

		if p.Status != "unsigned" {
			continue
		}

		existing, err := s.GetLatestContract(p.ID)
		if err != nil {
			log.Printf("  Warning: failed to check contract for %s: %v", p.Name, err)
			continue
		}
		if existing != nil {
			continue
		}

		transactions, err := fetchFATransactions(p.MLBID)
		if err != nil {
			log.Printf("  Warning: failed to fetch transactions for %s (mlb_id=%d): %v", p.Name, p.MLBID, err)
			continue
		}

		if len(transactions) == 0 {
			continue
		}

		latest := transactions[0]
		if latest.ToTeam == nil {
			continue
		}

		contract := &models.Contract{
			PlayerID:   p.ID,
			Team:       latest.ToTeam.Name,
			SignedDate: latest.Date,
		}

		if err := s.SaveContract(contract); err != nil {
			log.Printf("  Warning: failed to save contract for %s: %v", p.Name, err)
			continue
		}

		if err := s.UpdatePlayerStatus(p.ID, "signed"); err != nil {
			log.Printf("  Warning: failed to update status for %s: %v", p.Name, err)
			continue
		}

		log.Printf("  Signed: %s to %s on %s", p.Name, contract.Team, contract.SignedDate)
	}
	log.Println("Contract watch complete")
	return nil
}

func fetchFATransactions(mlbID int64) ([]MLBTransaction, error) {
	url := fmt.Sprintf("%s/transactions?playerId=%d&type=FA", mlbAPIBase, mlbID)
	var resp MLBTransactionsResponse
	if err := getJSON(url, &resp); err != nil {
		return nil, err
	}
	return resp.Transactions, nil
}

func StartContractWatch(s *store.Store, players []models.Player) {
	go func() {
		ticker := time.NewTicker(contractWatchInterval)
		defer ticker.Stop()

		if err := RunContractWatch(s, players); err != nil {
			log.Printf("Initial contract watch error: %v", err)
		}

		for range ticker.C {
			if err := RunContractWatch(s, players); err != nil {
				log.Printf("Scheduled contract watch error: %v", err)
			}
		}
	}()
}
