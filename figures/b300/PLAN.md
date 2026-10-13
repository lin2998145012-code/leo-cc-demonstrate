# B300 on a bring-up fixture — plan

**Size:** Hero (about 120 parts, one WebGL layer, take-apart). 3–4 hours.

**Concept.** At batch 1, an LLM decodes one token by reading every weight once from HBM.
The B300's 288 GB sits in 8 HBM3e stacks of 12 × 3 GB dies, read at 8 TB/s. So the
token rate ceiling is 8 TB/s ÷ weight bytes, and a model only runs if its weights fit.

**The object.** A B300 GPU module on a bench bring-up fixture: a base plate on feet,
two columns with rails and a top tie bar, and a crosshead that carries the cold plate.
Lift the crosshead and the package is open to view: two near-reticle dies on a CoWoS-L
interposer, four HBM3e stacks above them and four below, on a substrate with a stiffener,
on a board ringed with VRM power stages and inductors.

**What moves, and what it means.**
- The weights fill every stack from the bottom die up: the filled layers are lit. More
  bytes per weight or more parameters fill more layers; 405B at FP8 overflows.
- A read band sweeps up the filled layers of all 8 stacks at one constant speed (the
  bandwidth). Each finished sweep is one token: a flash on the two dies. Fuller stacks
  mean longer sweeps, so fewer tokens a second. The sweep runs 167× slower than real.
- Take apart: the cold plate lifts away, the dies and stacks lift off the interposer
  (showing the silicon bridges), the interposer lifts off the substrate, and the front
  stack fans into its base die and 12 core dies.

**Truth sources.** `model.mjs`. Package heights are drawn about 10× taller than real so
the 12 layers can be seen; plan sizes are representative, not an engineering drawing.

## Parts list

Base (lo/mid)
1. base plate, beveled, with halo · 2. groove · 3–6. four feet (flange + foot) ·
7. corner screws ×4 · 8. ruler strip + ticks · 9. label plate (3 rule lines, 2 screws) ·
10. nest plate for the module · 11–14. four standoffs with screws

Structure (mid)
15–16. two columns with foot blocks · 17–18. column foot bolts ·
19–20. guide rails on the columns' inner faces · 21. top tie bar · 22–25. tie-bar bolts ·
26–27. top end stops

Crosshead and cold plate (mid, hi) — moves up
28. crosshead beam · 29–30. carriage blocks on the rails · 31–32. lock knobs (knurled) ·
33. front handle · 34–37. four hanger screws with washers · 38. cold plate (copper) ·
39. cold-plate lid seam and screws · 40–41. coolant fittings · 42–43. quick-disconnect
couplings with caps · 44. hoses between fittings and couplings

Board (mid)
45. PCB with edge seam · 46–49. mounting holes and screws · 50–61. 12 VRM inductors ·
62–73. 12 power stages · 74–85. capacitor rows · 86. controller chip ·
87. power connector · 88. engraved label

Package (hi; the subject)
89. substrate · 90–97. substrate capacitors · 98–101. stiffener bars ·
102. CoWoS-L interposer · 103–113. silicon bridges (8 die–HBM, 1 die–die, edge) ·
114–115. two GPU dies (lit when a token completes) · 116–123. 8 HBM3e stacks, each a
base die + 12 core dies (13 slabs, 104 in all) · 124. the fanned front stack

## Controls
Model 8B / 70B / 405B, precision FP16 / FP8 / FP4, Open (crosshead), Take apart.
Keys: ←/→ model, ↑/↓ precision, O open, Space apart, Esc close.
Readout: `70B · FP8 · 70 GB · ≤ 114 tok/s`, or `405B · FP8 · 405 GB · 117 GB over 288`.
