package jobs

import (
	"encoding/json"
	"testing"
)

func TestFlexFloatUnmarshal(t *testing.T) {
	tests := []struct {
		in   string
		want float64
	}{
		{`3.2`, 3.2},
		{`"3.20"`, 3.2},
		{`"978.1"`, 978.1},
		{`""`, 0},
		{`"-.--"`, 0},
		{`"*.**"`, 0},
		{`".---"`, 0},
	}
	for _, tt := range tests {
		var f FlexFloat
		if err := json.Unmarshal([]byte(tt.in), &f); err != nil {
			t.Errorf("Unmarshal(%s) error: %v", tt.in, err)
			continue
		}
		if float64(f) != tt.want {
			t.Errorf("Unmarshal(%s) = %v, want %v", tt.in, f, tt.want)
		}
	}

	var f FlexFloat
	if err := json.Unmarshal([]byte(`"abc"`), &f); err == nil {
		t.Error("Unmarshal(\"abc\") expected error, got nil")
	}
}
