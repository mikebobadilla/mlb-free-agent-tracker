package handlers

import (
	"encoding/json"
	"html/template"
	"log"
	"mlb-tracker/internal/models"
	"mlb-tracker/internal/store"
	"net/http"
	"strconv"
)

type Handler struct {
	store   *store.Store
	tmpl    *template.Template
}

func New(s *store.Store, tmpl *template.Template) *Handler {
	return &Handler{store: s, tmpl: tmpl}
}

func (h *Handler) Dashboard(w http.ResponseWriter, r *http.Request) {
	data, err := h.store.GetDashboardData()
	if err != nil {
		log.Printf("Error getting dashboard data: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	if err := h.tmpl.ExecuteTemplate(w, "dashboard.html", data); err != nil {
		log.Printf("Error rendering template: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
}

func (h *Handler) APIPlayers(w http.ResponseWriter, r *http.Request) {
	players, err := h.store.GetAllPlayers()
	if err != nil {
		log.Printf("Error getting players: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(players)
}

func (h *Handler) PlayerDetail(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Path[len("/players/"):]
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid player ID", http.StatusBadRequest)
		return
	}

	player, err := h.store.GetPlayerByID(id)
	if err != nil {
		http.Error(w, "Player not found", http.StatusNotFound)
		return
	}

	contract, err := h.store.GetLatestContract(id)
	if err != nil {
		log.Printf("Error getting contract: %v", err)
	}

	rumors, err := h.store.GetRumorsForPlayer(id)
	if err != nil {
		log.Printf("Error getting rumors: %v", err)
	}

	pred, err := h.store.GetPredictionForPlayer(id)
	if err != nil {
		log.Printf("Error getting prediction: %v", err)
	}

	data := struct {
		Player     *models.Player
		Contract   *models.Contract
		Rumors     []models.Rumor
		Prediction *models.Prediction
	}{
		Player:     player,
		Contract:   contract,
		Rumors:     rumors,
		Prediction: pred,
	}

	if err := h.tmpl.ExecuteTemplate(w, "player_detail.html", data); err != nil {
		log.Printf("Error rendering template: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
}
