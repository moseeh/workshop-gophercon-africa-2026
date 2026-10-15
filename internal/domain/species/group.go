package species

import (
	"cmp"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Group is the everyday name people use for a kind of animal, such as
// "Whales", whatever its exact species.
type Group string

// The groups the application knows. Anything else is its own group,
// named after the species.
const (
	GroupWhales     Group = "Whales"
	GroupDolphins   Group = "Dolphins"
	GroupSharks     Group = "Sharks"
	GroupSeals      Group = "Seals & walruses"
	GroupOtters     Group = "Otters"
	GroupBigCats    Group = "Big cats"
	GroupBears      Group = "Bears"
	GroupWildDogs   Group = "Wild dogs"
	GroupHyenas     Group = "Hyenas"
	GroupZebras     Group = "Zebras"
	GroupRhinos     Group = "Rhinos"
	GroupElephants  Group = "Elephants"
	GroupGiraffes   Group = "Giraffes"
	GroupHippos     Group = "Hippos"
	GroupWildebeest Group = "Wildebeest"
	GroupBuffalo    Group = "Buffalo & bison"
	GroupAntelope   Group = "Antelope"
	GroupDeer       Group = "Deer & moose"
	GroupWildPigs   Group = "Wild pigs"
	GroupGreatApes  Group = "Great apes"
	GroupLemurs     Group = "Lemurs"
	GroupSloths     Group = "Sloths"
	GroupKangaroos  Group = "Kangaroos"
	GroupKoalas     Group = "Koalas"
	GroupWombats    Group = "Wombats"
	GroupPlatypus   Group = "Platypus"
	GroupCapybaras  Group = "Capybaras"
	GroupCrocodiles Group = "Crocodiles & alligators"
	GroupSeaTurtles Group = "Sea turtles"
	GroupMonitors   Group = "Monitor lizards"
	GroupPenguins   Group = "Penguins"
	GroupEagles     Group = "Eagles & hawks"
	GroupOwls       Group = "Owls"
	GroupParrots    Group = "Parrots & macaws"
	GroupFlamingos  Group = "Flamingos"
	GroupPuffins    Group = "Puffins & auks"
	GroupShoebills  Group = "Shoebills"
)

// byGenus settles the animals whose family alone would mislead, checked
// before the family: the orca is a dolphin by family, but called a whale.
var byGenus = map[string]Group{
	"Orcinus":      GroupWhales,
	"Globicephala": GroupWhales,
	"Connochaetes": GroupWildebeest,
	"Syncerus":     GroupBuffalo,
	"Bison":        GroupBuffalo,
	"Bubalus":      GroupBuffalo,
}

// byFamily maps a GBIF family to the group it belongs to. The whale shark
// (Rhincodontidae) is a shark, whatever its name says.
var byFamily = map[string]Group{
	"Balaenidae":        GroupWhales,
	"Balaenopteridae":   GroupWhales,
	"Eschrichtiidae":    GroupWhales,
	"Physeteridae":      GroupWhales,
	"Kogiidae":          GroupWhales,
	"Monodontidae":      GroupWhales,
	"Ziphiidae":         GroupWhales,
	"Delphinidae":       GroupDolphins,
	"Iniidae":           GroupDolphins,
	"Phocoenidae":       GroupDolphins,
	"Pontoporiidae":     GroupDolphins,
	"Lamnidae":          GroupSharks,
	"Rhincodontidae":    GroupSharks,
	"Carcharhinidae":    GroupSharks,
	"Sphyrnidae":        GroupSharks,
	"Phocidae":          GroupSeals,
	"Otariidae":         GroupSeals,
	"Odobenidae":        GroupSeals,
	"Mustelidae":        GroupOtters,
	"Felidae":           GroupBigCats,
	"Ursidae":           GroupBears,
	"Canidae":           GroupWildDogs,
	"Hyaenidae":         GroupHyenas,
	"Equidae":           GroupZebras,
	"Rhinocerotidae":    GroupRhinos,
	"Elephantidae":      GroupElephants,
	"Giraffidae":        GroupGiraffes,
	"Hippopotamidae":    GroupHippos,
	"Bovidae":           GroupAntelope,
	"Cervidae":          GroupDeer,
	"Suidae":            GroupWildPigs,
	"Hominidae":         GroupGreatApes,
	"Lemuridae":         GroupLemurs,
	"Bradypodidae":      GroupSloths,
	"Megalonychidae":    GroupSloths,
	"Choloepodidae":     GroupSloths,
	"Macropodidae":      GroupKangaroos,
	"Phascolarctidae":   GroupKoalas,
	"Vombatidae":        GroupWombats,
	"Ornithorhynchidae": GroupPlatypus,
	"Caviidae":          GroupCapybaras,
	"Alligatoridae":     GroupCrocodiles,
	"Crocodylidae":      GroupCrocodiles,
	"Gavialidae":        GroupCrocodiles,
	"Cheloniidae":       GroupSeaTurtles,
	"Dermochelyidae":    GroupSeaTurtles,
	"Varanidae":         GroupMonitors,
	"Spheniscidae":      GroupPenguins,
	"Accipitridae":      GroupEagles,
	"Strigidae":         GroupOwls,
	"Tytonidae":         GroupOwls,
	"Psittacidae":       GroupParrots,
	"Phoenicopteridae":  GroupFlamingos,
	"Alcidae":           GroupPuffins,
	"Balaenicipitidae":  GroupShoebills,
}

// Group returns the everyday group the species belongs to. Species the
// application doesn't group are a group of their own, under their name.
func (s Species) Group() Group {
	if g, ok := byGenus[s.Genus]; ok {
		return g
	}
	if g, ok := byFamily[s.Family]; ok {
		return g
	}
	return Group(capitalise(cmp.Or(s.VernacularName, s.CanonicalName, s.ScientificName, "Unknown animals")))
}

// String implements fmt.Stringer on Group.
func (g Group) String() string {
	return string(g)
}

// capitalise upper-cases the first letter, so "moose" reads as a heading.
func capitalise(s string) string {
	s = strings.TrimSpace(s)
	r, size := utf8.DecodeRuneInString(s)
	if size == 0 {
		return s
	}
	return string(unicode.ToUpper(r)) + s[size:]
}
