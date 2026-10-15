package country

import "strings"

// Continent is one of the seven continents a country sits on.
type Continent string

// The continents. Countries that span two, such as Russia or Egypt, are
// filed under the one most of their people live on.
const (
	ContinentAfrica       Continent = "Africa"
	ContinentEurope       Continent = "Europe"
	ContinentAsia         Continent = "Asia"
	ContinentNorthAmerica Continent = "North America"
	ContinentSouthAmerica Continent = "South America"
	ContinentOceania      Continent = "Oceania"
	ContinentAntarctica   Continent = "Antarctica"
)

var continents = func() map[Code]Continent {
	lists := map[Continent]string{
		ContinentAfrica: "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML " +
			"MR MU YT MA MZ NA NE NG RE RW SH ST SN SC SL SO ZA SS SD TZ TG TN UG EH ZM ZW",
		ContinentEurope: "AL AD AT BY BE BA BG HR CY CZ DK EE FO FI FR DE GI GR GG HU IS IE IM IT JE XK LV LI LT LU MT MD " +
			"MC ME NL MK NO PL PT RO RU SM RS SK SI ES SJ SE CH UA GB VA AX",
		ContinentAsia: "AF AM AZ BH BD BT BN KH CN GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO MY MV MN MM NP KP OM PK PS " +
			"PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE IO",
		ContinentNorthAmerica: "AI AG AW BS BB BZ BM BQ VG CA KY CR CU CW DM DO SV GL GD GP GT HT HN JM MQ MX MS NI PA PR BL " +
			"KN LC MF PM VC SX TT TC US VI UM",
		ContinentSouthAmerica: "AR BO BR CL CO EC FK GF GY PY PE SR UY VE GS",
		ContinentOceania:      "AS AU CK FJ PF GU KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV VU WF",
		ContinentAntarctica:   "AQ BV HM TF",
	}
	out := make(map[Code]Continent)
	for continent, codes := range lists {
		for _, code := range strings.Fields(codes) {
			out[Code(code)] = continent
		}
	}
	return out
}()

// Continent returns the continent the country is on, or "" when the code
// is empty or unknown, such as a sighting out at sea.
func (c Code) Continent() Continent {
	return continents[c]
}

// String implements fmt.Stringer on Continent.
func (c Continent) String() string {
	return string(c)
}
