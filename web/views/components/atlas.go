package components

import (
	"cmp"
	"fmt"
	"net/url"
	"path"
	"slices"
	"strings"
	"unicode/utf8"

	"workshop/internal/domain/sighting"
)

// Pin is one sighting as the globe needs it: kept short, since every sighting is sent at once.
type Pin struct {
	ID      string  `json:"id"`
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
	T       int64   `json:"t"`
	Name    string  `json:"n"`
	Place   string  `json:"p"`
	Sky     string  `json:"w"`
	Species string  `json:"s"`
	Country string  `json:"c"`
	Group   string  `json:"g"`
	// The where of a sighting, for search: its continent, country and region.
	Continent   string `json:"ct,omitempty"`
	CountryName string `json:"cn,omitempty"`
	Region      string `json:"rg,omitempty"`
	// Note is the start of the observer's remarks, empty when they left none.
	Note string `json:"r,omitempty"`
}

// Pins turns sightings into globe pins, oldest first, the order the voyage plays them in.
func Pins(sightings []sighting.Sighting) []Pin {
	pins := make([]Pin, 0, len(sightings))
	for _, s := range sightings {
		pins = append(pins, Pin{
			ID:      s.ID.String(),
			Lat:     s.Location.Latitude,
			Lng:     s.Location.Longitude,
			T:       s.HappenedAt.Unix(),
			Name:    DisplayName(s),
			Place:   Place(s.Location),
			Sky:     Sky(s),
			Species: cmp.Or(s.Species.ScientificName, DisplayName(s)),
			Country: s.Location.CountryCode.String(),
			Group:   s.Species.Group().String(),

			Continent:   s.Location.CountryCode.Continent().String(),
			CountryName: s.Location.Country,
			Region:      s.Location.StateProvince,
			Note:        notePreview(s.Remarks),
		})
	}
	slices.SortStableFunc(pins, func(a, b Pin) int { return cmp.Compare(a.T, b.T) })
	return pins
}

// notePreview cuts remarks to a line or two for lists; the field guide shows them whole.
func notePreview(remarks string) string {
	remarks = strings.Join(strings.Fields(remarks), " ")
	if utf8.RuneCountInString(remarks) <= 140 {
		return remarks
	}
	r := []rune(remarks)[:140]
	return strings.TrimRight(string(r), " ,.;:") + "…"
}

// DisplayName prefers the name a reader would recognise, falling back through the taxonomy.
func DisplayName(s sighting.Sighting) string {
	sp := s.Species
	return cmp.Or(sp.VernacularName, sp.CanonicalName, sp.ScientificName, "Unknown species")
}

// Place joins whichever parts of the location GBIF supplied.
func Place(l sighting.Location) string {
	parts := slices.DeleteFunc(
		[]string{l.Locality, l.StateProvince, l.Country},
		func(s string) bool { return s == "" },
	)
	return cmp.Or(strings.Join(parts, ", "), "Location unknown")
}

// Seen writes the date a sighting happened, the way the logbook reads.
func Seen(s sighting.Sighting) string {
	return s.HappenedAt.UTC().Format("2 January 2006")
}

// Observer names who recorded a sighting, or says nobody did.
func Observer(s sighting.Sighting) string {
	return cmp.Or(s.RecordedBy, "Unknown observer")
}

// Sky groups a sighting's weather into the kind of sky it was seen under.
func Sky(s sighting.Sighting) string {
	if s.Weather.ObservedAt.IsZero() {
		return ""
	}
	return sky(s.Weather.Condition.Code)
}

// lineage is the class and family line above a field-guide title.
func lineage(s sighting.Sighting) string {
	parts := slices.DeleteFunc(
		[]string{s.Species.Class, s.Species.Family},
		func(s string) bool { return s == "" },
	)
	return strings.Join(parts, " · ")
}

// stills keeps the photos, since other media can't be shown as a plate.
func stills(media []sighting.Media) []sighting.Media {
	return slices.DeleteFunc(slices.Clone(media), func(m sighting.Media) bool {
		return m.Type != "StillImage" || m.URL == ""
	})
}

// photoURL asks iNaturalist for its medium copy, about a twelfth of the original's size.
func photoURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	if u.Host != "inaturalist-open-data.s3.amazonaws.com" && u.Host != "static.inaturalist.org" {
		return raw
	}
	dir, file := path.Split(u.Path)
	if !strings.HasPrefix(file, "original.") {
		return raw
	}
	u.Path = dir + "medium." + strings.TrimPrefix(file, "original.")
	return u.String()
}

// photoAlt describes a photo, falling back to the animal it shows.
func photoAlt(s sighting.Sighting, m sighting.Media) string {
	return cmp.Or(m.Title, m.Description, "Photo of "+DisplayName(s))
}

// photoCredit credits a photo's maker and licence, as far as GBIF knows them.
func photoCredit(m sighting.Media) string {
	who := cmp.Or(m.Creator, m.RightsHolder)
	switch {
	case who != "" && m.License != "":
		return "© " + who + " · " + licence(m.License)
	case who != "":
		return "© " + who
	default:
		return ""
	}
}

// licence shortens a Creative Commons URL to its name, such as "CC BY-NC 4.0".
func licence(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || !strings.Contains(u.Host, "creativecommons.org") {
		return raw
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) >= 3 && parts[0] == "licenses" {
		return "CC " + strings.ToUpper(parts[1]) + " " + parts[2]
	}
	if len(parts) >= 2 && parts[0] == "publicdomain" {
		return "Public domain"
	}
	return raw
}

// individuals renders how many animals were seen in a single sighting.
func individuals(n int) string {
	if n == 1 {
		return "1 individual"
	}
	return fmt.Sprintf("%d individuals", n)
}
