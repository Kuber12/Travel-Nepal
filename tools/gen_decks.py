import json, sys, os
out_dir = sys.argv[1]

def photo(id, title, blurb, pts): return dict(id=id, category="photograph", title=title, blurb=blurb, points=pts, toPassport=True)
def souv(id, title, blurb, pts): return dict(id=id, category="souvenir", title=title, blurb=blurb, points=pts, toPassport=True)
def tour(id, title, blurb, pts, target=5): return dict(id=id, category="travel-tour", title=title, blurb=blurb, points=pts, toPassport=True, minigame={"type": "dice-off", "target": target})
def feast(id, title, blurb, pts): return dict(id=id, category="get-together", title=title, blurb=blurb, points=pts, toPassport=True, minigame={"type": "feast", "opponents": "all"})
def duel(id, title, blurb, pts): return dict(id=id, category="duel-1v1", title=title, blurb=blurb, points=pts, toPassport=True, minigame={"type": "dice-off", "opponents": "one"})
def duel2(id, title, blurb, pts): return dict(id=id, category="duel-2v2", title=title, blurb=blurb, points=pts, toPassport=True, minigame={"type": "dice-off", "opponents": "all"})

decks = {
"lumbini": [
    photo("lum-photo-mayadevi", "Maya Devi Temple", "The white temple built over the marker stone said to show the exact spot where Siddhartha Gautama was born, in 623 BC by tradition. A UNESCO World Heritage Site.", 80),
    photo("lum-photo-ashoka", "Ashoka Pillar", "Emperor Ashoka of the Maurya dynasty raised this sandstone pillar on his pilgrimage in 249 BC. Its Brahmi inscription is the oldest evidence of Lumbini as the Buddha's birthplace.", 70),
    photo("lum-photo-pond", "Puskarini Sacred Pond", "The pond where Queen Maya Devi is said to have bathed before giving birth, and where the infant Buddha was given his first bath.", 50),
    photo("lum-photo-peace", "World Peace Pagoda", "A gleaming white stupa built by Japanese Buddhists at the northern end of the monastic zone, with a golden Buddha in each niche.", 60),
    photo("lum-photo-monastic", "Monastic Zone", "Monasteries from Thailand, Myanmar, China, Germany and more stand either side of a long canal — the whole Buddhist world in one walk.", 60),
    souv("lum-souvenir-beads", "Bodhi Seed Mala", "A string of 108 prayer beads made from bodhi seeds, sold by the stalls at the edge of the sacred garden.", 30),
    tour("lum-tour-cycle", "Cycle the Sacred Garden", "Hire a bicycle and cover the monastic zone before the midday heat, or walk it and see half. Roll for how far you get.", 50),
    feast("lum-together-dalbhat", "Dal Bhat at the Dharamsala", "Lentils, rice, tarkari and achar, refilled until you say stop. Everyone at the table collects.", 30),
    duel("lum-duel-meditation", "Meditation Stillness Challenge", "Who can sit still the longest under the bodhi tree? Challenge one traveller — highest roll keeps their calm.", 40),
],
"pokhara": [
    photo("pok-photo-phewa", "Phewa Lake", "Nepal's second-largest lake, with Machhapuchhre reflected in still water at dawn. Painted wooden doongas ferry visitors across.", 70),
    photo("pok-photo-barahi", "Tal Barahi Temple", "A two-tiered pagoda on a small island in the middle of Phewa Lake, dedicated to the boar-headed goddess Barahi.", 60),
    photo("pok-photo-sarangkot", "Sunrise from Sarangkot", "From the ridge above the lake, the sun lights Dhaulagiri, Annapurna and Machhapuchhre one after another.", 80),
    photo("pok-photo-davis", "Davis Falls", "Patale Chhango, where the Pardi Khola vanishes into an underground tunnel. Just across the road, Gupteshwor Mahadev Cave follows the water down.", 50),
    photo("pok-photo-shanti", "World Peace Stupa", "Shanti Stupa crowns the Anadu hill on the far shore of Phewa — the view back over the city and lake is worth the climb.", 60),
    souv("pok-souvenir-pashmina", "Pashmina Shawl", "Soft cashmere woven from the undercoat of Himalayan mountain goats, bargained for in a Lakeside shop.", 40),
    tour("pok-tour-paragliding", "Paragliding over the Lake", "Launch off Sarangkot and spiral down with the eagles. Roll for the thermals — a good one keeps you up for an hour.", 70, 6),
    tour("pok-tour-boating", "Boating on Phewa", "Row yourself out to Tal Barahi, or hire a boatman and arrive dry. Roll to see how straight you steer.", 40),
    duel2("pok-duel-zipline", "Zipline Race", "One of the steepest ziplines in the world drops off Sarangkot. Everyone races — highest roll hits the bottom first.", 50),
],
"himalayan": [
    photo("him-photo-ghandruk", "Ghandruk Village", "A Gurung village of slate-roofed stone houses, with Annapurna South and Machhapuchhre filling the sky above the terraces.", 70),
    photo("him-photo-poonhill", "Poon Hill Sunrise", "At 3,210 m, the most famous viewpoint on the Annapurna circuit — a panorama from Dhaulagiri to Annapurna I.", 80),
    photo("him-photo-ghorepani", "Ghorepani Rhododendrons", "In spring the forest above Ghorepani turns red and pink with laliguras, Nepal's national flower.", 60),
    photo("him-photo-sikles", "Sikles Village", "One of the largest Gurung settlements, a cluster of stone houses on a ridge facing Lamjung Himal.", 50),
    souv("him-souvenir-gurung", "Gurung Bhangra Shawl", "A handwoven nettle-fibre wrap worn over the shoulder, a traditional Gurung garment.", 30),
    tour("him-tour-homestay", "Gurung Homestay", "Stay with a family in the village, or pitch a tent outside it. Roll to see how warm a welcome you get.", 50),
    feast("him-together-rodhi", "Rodhi Ghar Evening", "Songs and dancing around the fire in the village rodhi house. Everyone at the table collects.", 30),
    duel("him-duel-teahouse", "Tea-House Race", "First to the next tea house gets the warm room. Challenge one traveller — highest roll wins the bed.", 40),
],
"eastern": [
    photo("eas-photo-ilam", "Ilam Tea Gardens", "Rolling hills of manicured tea bushes in Nepal's far east. Ilam's orthodox teas are sold around the world.", 70),
    photo("eas-photo-kanchenjunga", "Kanchenjunga", "At 8,586 m, the third-highest mountain on Earth, straddling the border of Nepal and Sikkim. Its base camp trek is one of the wildest in the country.", 90),
    photo("eas-photo-koshi", "Koshi Tappu Wildlife Reserve", "Wetlands on the Sapta Koshi floodplain, home to the last wild water buffalo (arna) in Nepal and hundreds of bird species.", 60),
    photo("eas-photo-antu", "Antu Danda Sunrise", "The hilltop near the Indian border where the sun climbs out of a sea of cloud over the tea gardens.", 60),
    photo("eas-photo-pathibhara", "Pathibhara Devi", "A hilltop shrine above Taplejung at 3,794 m, one of the most important pilgrimage sites in the east.", 50),
    souv("eas-souvenir-tea", "Ilam First-Flush Tea", "A tin of the first spring picking — light, floral, and the pride of the eastern hills.", 30),
    tour("eas-tour-teapick", "Tea-Picking with the Pickers", "Join the pickers on the slopes at dawn: two leaves and a bud. Roll to fill your basket.", 50),
    feast("eas-together-kinema", "Kinema and Tongba", "Fermented soybean curry and hot millet beer sipped through a bamboo straw. Everyone at the table collects.", 30),
    duel("eas-duel-chhurpi", "Chhurpi Chewing Contest", "Hard yak-cheese chhurpi can last an hour. Challenge one traveller — highest roll finishes theirs first.", 40),
],
"westernterai": [
    photo("wtr-photo-bardiya", "Bardiya National Park", "The largest untouched wilderness in the Terai, where tigers, wild elephants and rhinos roam the sal forest and grasslands.", 80),
    photo("wtr-photo-karnali", "Karnali River", "Nepal's longest river spills out of the hills at Chisapani; gangetic river dolphins are sometimes seen in its waters.", 60),
    photo("wtr-photo-shuklaphanta", "Shuklaphanta Grasslands", "The far-western park holds one of the largest herds of swamp deer in the world on its open phanta grasslands.", 60),
    photo("wtr-photo-ghodaghodi", "Ghodaghodi Lake", "A chain of oxbow lakes in Kailali, a Ramsar wetland rich in birds, turtles and mugger crocodiles.", 50),
    souv("wtr-souvenir-basket", "Tharu Grass Basket", "A colourful basket woven from local grasses by Tharu women of the western plains.", 30),
    tour("wtr-tour-tigertrack", "Tiger Tracking on Foot", "Follow a naturalist along the river beds at dawn, looking for fresh pugmarks. Roll for your sighting.", 70, 6),
    tour("wtr-tour-rafting", "Karnali Rafting", "Run the big water of the Karnali, or watch from the bank. Roll to stay in the boat.", 50),
    duel2("wtr-duel-maghi", "Maghi Dance-Off", "The Tharu new year festival, with dancing all night. Everyone joins — highest roll leads the ring.", 40),
],
"westernhillside": [
    photo("whl-photo-bandipur", "Bandipur Bazaar", "A Newar trading town frozen in time on a saddle above the highway, with car-free streets and a view of the whole Himalayan range.", 70),
    photo("whl-photo-gorkha", "Gorkha Durbar", "The hilltop palace of King Prithvi Narayan Shah, from where the unification of Nepal began in the 18th century.", 70),
    photo("whl-photo-tansen", "Tansen and Rani Mahal", "Hill town of Palpa, and the riverside 'Taj Mahal of Nepal' built by a general for his late wife on the Kali Gandaki.", 60),
    photo("whl-photo-rara", "Rara Lake", "Nepal's largest lake, deep blue at 2,990 m in the remote north-west, ringed by pine and juniper.", 80),
    souv("whl-souvenir-dhaka", "Palpali Dhaka Topi", "The patterned cap woven on handlooms in Palpa — part of Nepal's national dress.", 30),
    souv("whl-souvenir-karuwa", "Palpali Karuwa", "A bronze water jug cast by Palpa's metalworkers, given at weddings and festivals.", 30),
    tour("whl-tour-cave", "Siddha Cave", "One of the largest caves in Nepal, below Bandipur. Take a guide and torch, or feel your way. Roll for how deep you go.", 50),
    duel("whl-duel-ridge", "Ridge Walk Race", "Race one traveller along the ridge to Thani Mai temple for the sunrise. Highest roll gets there first.", 40),
],
}

for name, cards in decks.items():
    ids = [c["id"] for c in cards]
    assert len(ids) == len(set(ids))
    with open(os.path.join(out_dir, f"{name}.json"), "w") as f:
        json.dump({"id": name, "cards": cards}, f, indent=2, ensure_ascii=False)
        f.write("\n")
print("wrote", len(decks), "decks")
