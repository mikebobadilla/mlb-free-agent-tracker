package jobs

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestFlexFloatUnmarshal(t *testing.T) {
	tests := []struct {
		in    string
		want  float64
		valid bool
	}{
		{`3.2`, 3.2, true},
		{`"3.20"`, 3.2, true},
		{`"978.1"`, 978.1, true},
		{`"0.00"`, 0, true},
		{`""`, 0, false},
		{`"-.--"`, 0, false},
		{`"*.**"`, 0, false},
		{`".---"`, 0, false},
	}
	for _, tt := range tests {
		var f FlexFloat
		if err := json.Unmarshal([]byte(tt.in), &f); err != nil {
			t.Errorf("Unmarshal(%s) error: %v", tt.in, err)
			continue
		}
		if f.Value != tt.want || f.Valid != tt.valid {
			t.Errorf("Unmarshal(%s) = %+v, want {Value:%v Valid:%v}", tt.in, f, tt.want, tt.valid)
		}
	}

	var f FlexFloat
	if err := json.Unmarshal([]byte(`"abc"`), &f); err == nil {
		t.Error("Unmarshal(\"abc\") expected error, got nil")
	}
}

// fakeMLBAPI serves /people/{id} and /people/{id}/stats from canned JSON.
// statsBySeason maps a season query param to a stats response body; seasons
// not in the map get an empty response, like the real API.
func fakeMLBAPI(t *testing.T, age int, statsBySeason map[string]string) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/stats") {
			body, ok := statsBySeason[r.URL.Query().Get("season")]
			if !ok {
				body = `{"stats":[]}`
			}
			fmt.Fprint(w, body)
			return
		}
		fmt.Fprintf(w, `{"people":[{"id":1,"fullName":"Test Player","currentAge":%d}]}`, age)
	}))
	t.Cleanup(srv.Close)

	orig := mlbAPIBase
	mlbAPIBase = srv.URL
	t.Cleanup(func() { mlbAPIBase = orig })
}

const pitcherSeason = `{"stats":[{"type":{"displayName":"season"},"group":{"displayName":"pitching"},
	"splits":[{"season":"2026","stat":{"era":"3.20","gamesPlayed":32}}]}]}`

func TestFetchPlayerAge(t *testing.T) {
	fakeMLBAPI(t, 31, nil)
	age, err := fetchPlayerAge(1)
	if err != nil {
		t.Fatal(err)
	}
	if age != 31 {
		t.Errorf("age = %d, want 31", age)
	}
}

func TestFetchLatestStatsCurrentSeason(t *testing.T) {
	fakeMLBAPI(t, 31, map[string]string{"2026": pitcherSeason})
	stats, err := fetchLatestStats(1, 2026)
	if err != nil {
		t.Fatal(err)
	}
	if stats.Season != 2026 || stats.ERA == nil || *stats.ERA != 3.2 {
		t.Errorf("got season=%d era=%v", stats.Season, stats.ERA)
	}
}

func TestFetchLatestStatsFallsBackToLastSeason(t *testing.T) {
	fakeMLBAPI(t, 31, map[string]string{"2026": pitcherSeason})
	stats, err := fetchLatestStats(1, 2027)
	if err != nil {
		t.Fatal(err)
	}
	if stats.Season != 2026 || stats.ERA == nil {
		t.Errorf("got season=%d era=%v, want 2026 stats", stats.Season, stats.ERA)
	}
}

func TestFetchLatestStatsNoData(t *testing.T) {
	fakeMLBAPI(t, 31, nil)
	stats, err := fetchLatestStats(1, 2027)
	if err != nil {
		t.Fatal(err)
	}
	if stats.Season != 0 || stats.ERA != nil {
		t.Errorf("got season=%d era=%v, want empty stats", stats.Season, stats.ERA)
	}
}

func TestFetchSeasonStatsTradedPlayerUsesTotal(t *testing.T) {
	// Real API order: season total (no team) first, then one split per team.
	// Put a team split first to make sure we don't rely on ordering.
	fakeMLBAPI(t, 28, map[string]string{"2024": `{"stats":[{"type":{"displayName":"season"},"group":{"displayName":"pitching"},
		"splits":[
			{"team":{"name":"Miami Marlins"},"stat":{"era":"5.00"}},
			{"stat":{"era":"4.00"}},
			{"team":{"name":"New York Yankees"},"stat":{"era":"2.00"}}]}]}`})
	stats, err := fetchSeasonStats(1, 2024)
	if err != nil {
		t.Fatal(err)
	}
	if stats == nil || stats.ERA == nil || *stats.ERA != 4.0 {
		t.Errorf("got %+v, want season-total ERA 4.00", stats)
	}
}

func TestFetchSeasonStatsUndefinedERA(t *testing.T) {
	fakeMLBAPI(t, 28, map[string]string{"2026": `{"stats":[{"type":{"displayName":"season"},"group":{"displayName":"pitching"},
		"splits":[{"stat":{"era":"-.--","gamesPlayed":1}}]}]}`})
	stats, err := fetchSeasonStats(1, 2026)
	if err != nil {
		t.Fatal(err)
	}
	if stats == nil || stats.Season != 2026 || stats.ERA != nil {
		t.Errorf("got %+v, want season 2026 with nil ERA", stats)
	}
}
