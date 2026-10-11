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

func TestFormatAvg(t *testing.T) {
	ops, big := .908, 1.036
	if got := formatAvg(&ops); got != ".908" {
		t.Errorf("formatAvg(.908) = %q", got)
	}
	if got := formatAvg(&big); got != "1.036" {
		t.Errorf("formatAvg(1.036) = %q", got)
	}
	if got := formatAvg(nil); got != "-" {
		t.Errorf("formatAvg(nil) = %q", got)
	}
}

func TestPlayerDetailHitterVsPitcher(t *testing.T) {
	f := func(v float64) *float64 { return &v }
	render := func(p *models.Player) string {
		data := struct {
			Player     *models.Player
			Contract   *models.Contract
			Rumors     []models.Rumor
			Prediction *models.Prediction
		}{Player: p}
		var out strings.Builder
		if err := parseTemplates(t).ExecuteTemplate(&out, "player_detail.html", data); err != nil {
			t.Fatal(err)
		}
		return out.String()
	}

	hitter := render(&models.Player{Name: "Juan Soto", Season: 2026, OBP: f(.393), SLG: f(.515), OPS: f(.908)})
	if !strings.Contains(hitter, ".908") || strings.Contains(hitter, "Pitching") {
		t.Error("hitter page should show OPS and no pitching section")
	}

	pitcher := render(&models.Player{Name: "Blake Snell", Season: 2026,
		ERA: f(1.9), WHIP: f(1.1), IP: f(42.2), K9: f(11.6), FIP: f(1.717)})
	for _, want := range []string{"1.90", "42.2", "11.60", "1.72"} {
		if !strings.Contains(pitcher, want) {
			t.Errorf("pitcher page missing %q", want)
		}
	}
	if strings.Contains(pitcher, "Hitting") {
		t.Error("pitcher page should have no hitting section")
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
