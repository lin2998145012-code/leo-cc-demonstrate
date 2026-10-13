# B300 showcase film

A 45-second, 1920×1080 film of the B300 figure, laid out like the anatomy skill's own launch
film: the prompt typed in Claude Code, the machine drawn part by part, the weights loading,
the model and precision being changed, the package taken apart, and the install line.

The figure in the film is the real `../b300-light.html`, running live. A virtual clock steps
the film and the figure together, so every frame is the same on every run.

```sh
node ../build.mjs --light          # if the figure changed
node build-film.mjs                # writes film.html
npm i playwright-core              # once (or set PLAYWRIGHT_CORE to an existing copy)
CHROME_PATH=/path/to/chrome node record.mjs --fps 60      # writes b300-film.mp4 (needs ffmpeg)
CHROME_PATH=/path/to/chrome node record.mjs --stills 6,16,32.5   # PNG stills to check
```

- All the words are in `TEXT` at the top of `build-film.mjs`; the timing is in `film.js`
  (`CLICKS`, `STEPS` and the `span(...)` times in `render`).
- Fonts are Google Fonts subsets in `fonts/` (EB Garamond, Noto Serif SC, Noto Sans SC), cut
  to the characters the film uses. If you change the Chinese text, refetch them:
  `node build-film.mjs --chars` prints the characters to request with `&text=`.
- `thumbs/` are light-theme captures of the skill's shipped examples and of B300, used in the
  opening scatter.
- The opening "you type one line" is a dramatisation: the real figure took a conversation and a
  few rounds of review. Every number on screen comes from `../model.mjs` through the figure.
