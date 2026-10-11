package main

import (
	"html/template"
	"strings"
	"testing"
	"time"

	"mlb-tracker/internal/models"
)

func parseTemplates(t *testing.T) *template.Template {
	t.Helper()
	return template.Must(template.New("").Funcs(funcMap).ParseGlob("../../web/templates/*.html"))
}

func TestFormatStat(t *testing.T) {
	era := 3.2
	if got := formatStat("%.2f", &era); got != "3.20" {
		t.Errorf("formatStat(3.2) = %q, want 3.20", got)
	}
	if got := formatStat("%.2f", nil); got != "-" {
		t.Errorf("formatStat(nil) = %q, want -", got)
	}
}

func TestDashboardRenders(t *testing.T) {
	era := 3.2
	data := []models.PlayerDashboard{
		{Player: models.Player{ID: 1, Name: "Corbin Burnes", Position: "SP", Age: 31, ERA: &era, Season: 2026, Status: "unsigned", UpdatedAt: time.Now()}},
		{Player: models.Player{ID: 2, Name: "Juan Soto", Position: "OF", Age: 27, Status: "unsigned"}},
	}
	var out strings.Builder
	if err := parseTemplates(t).ExecuteTemplate(&out, "dashboard.html", data); err != nil {
		t.Fatal(err)
	}
	html := out.String()
	for _, want := range []string{"3.20", "2026", "Juan Soto"} {
		if !strings.Contains(html, want) {
			t.Errorf("dashboard missing %q", want)
		}
	}
	if strings.Contains(html, "0x") || strings.Contains(html, "%!") {
		t.Error("dashboard rendered a pointer or format error")
	}
}

func TestPlayerDetailRenders(t *testing.T) {
	era := 3.2
	data := struct {
		Player     *models.Player
		Contract   *models.Contract
		Rumors     []models.Rumor
		Prediction *models.Prediction
	}{Player: &models.Player{ID: 1, Name: "Corbin Burnes", ERA: &era, Season: 2025}}
	var out strings.Builder
	if err := parseTemplates(t).ExecuteTemplate(&out, "player_detail.html", data); err != nil {
		t.Fatal(err)
	}
	html := out.String()
	if !strings.Contains(html, "2025 Season") || !strings.Contains(html, "3.20") {
		t.Errorf("player detail missing season or ERA")
	}
}
