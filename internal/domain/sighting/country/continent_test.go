package country

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCode_Continent(t *testing.T) {
	t.Parallel()

	tt := map[string]struct {
		input Code
		want  Continent
	}{
		"Kenya":         {input: "KE", want: ContinentAfrica},
		"Norway":        {input: "NO", want: ContinentEurope},
		"Oman":          {input: "OM", want: ContinentAsia},
		"Bonaire":       {input: "BQ", want: ContinentNorthAmerica},
		"Falklands":     {input: "FK", want: ContinentSouthAmerica},
		"New Caledonia": {input: "NC", want: ContinentOceania},
		"Antarctica":    {input: "AQ", want: ContinentAntarctica},
		"Empty":         {input: "", want: ""},
		"Unknown":       {input: "ZZ", want: ""},
	}

	for name, test := range tt {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, test.want, test.input.Continent())
		})
	}
}
