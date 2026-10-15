package components

import (
	"fmt"

	"workshop/internal/domain/weather"
)

var winds = [...]struct{ class, name string }{
	{"n", "north"}, {"ne", "north-east"}, {"e", "east"}, {"se", "south-east"},
	{"s", "south"}, {"sw", "south-west"}, {"w", "west"}, {"nw", "north-west"},
}

// sky groups a WMO 4677 weather code into the icon that stands for it.
func sky(code int) string {
	switch {
	case code == 0:
		return "clear"
	case code <= 3:
		return "cloudy"
	case code <= 9, code >= 30 && code <= 35:
		return "dust"
	case code <= 12, code == 28, code >= 40 && code <= 49:
		return "fog"
	case code <= 19, code == 29, code >= 91 && code <= 99:
		return "storm"
	case code == 20, code >= 50 && code <= 59:
		return "drizzle"
	case code == 22, code == 26, code >= 36 && code <= 39, code >= 70 && code <= 79, code == 85, code == 86:
		return "snow"
	case code <= 27, code >= 60 && code <= 69, code >= 80 && code <= 90:
		return "rain"
	default:
		return "cloudy"
	}
}

// degrees renders a temperature to the nearest whole degree.
func degrees(c float64) string {
	return fmt.Sprintf("%.0f °C", c)
}

// kmh renders a wind speed to the nearest whole km/h.
func kmh(v float64) string {
	return fmt.Sprintf("%.0f km/h", v)
}

// point picks the eight-point compass entry for a bearing in degrees.
func point(deg int) int {
	return (((deg%360)+360)%360 + 22) / 45 % 8
}

// compass names the direction the wind blew from, as a class suffix.
func compass(deg int) string {
	return winds[point(deg)].class
}

// windLabel spells the wind out for screen readers.
func windLabel(w weather.Wind) string {
	return fmt.Sprintf("Wind %s from the %s", kmh(w.Speed), winds[point(w.Direction)].name)
}
