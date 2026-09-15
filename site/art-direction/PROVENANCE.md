# Site artwork and typography

Prepared September 15, 2026 for the public Runtime Story SDK repository and GitHub Pages showcase.

## Original promotional artwork

Three new images were generated using the built-in OpenAI image generation tool. They were created from text prompts without third-party reference images. They depict original worlds and contain no intentionally reused franchise characters, logos or interface artwork.

| Website asset | Subject | Exact generation record |
| --- | --- | --- |
| `assets/crossing.webp` | A traveler at a broken fantasy crossing, with a ferry and alternate trail | [crossing.json](crossing.json) |
| `assets/crossing-mobile.webp` | Smaller derivative of the same crossing | [crossing.json](crossing.json) |
| `assets/warehouse.webp` | A port warehouse, ledger exchange and closed gate | [warehouse.json](warehouse.json) |
| `assets/relay.webp` | An engineer and a remote communications station | [relay.json](relay.json) |

The images were visually reviewed before selection. The crossing has deliberate quiet space for headline text, while the warehouse and station retain legible silhouettes in portrait crops. WebP derivatives were encoded with `cwebp`, using quality 85 for the desktop crossing, 78 for the 820-pixel mobile crossing and 82 at 1100-pixel width for the warehouse and relay. No creative content was added by the encoder.

These paintings are concept art used to present the demos. They do not imply that the demos render these new environments or that the SDK generates graphical worlds. This distinction is stated in the site footer.

Full-resolution originals are retained locally in ignored `site/generated-originals/`, as well as the original built-in generation output store. They are excluded from the public repository and Pages artifact. Their SHA-256 values are recorded below so the selected source remains identifiable.

## Existing project material

`assets/emberwake-map.webp` is an optimized derivative of the selected original project asset `examples/emberwake/public/art/lantern-reach-v1.png`. The original asset's generation and selection records remain in `examples/emberwake/art-direction/`. The site overlays a simple illustrative route using SVG. It does not execute an SDK plan or claim that this overlay comes from a live model call.

`assets/emberwake-gameplay.webp` derives from the actual September 13 retained `emberwake-visual-polish/live-storm-v2.jpg` gameplay screenshot. It shows the authored broken crossing, confirmed companion rescue, recovered relic and revision interface. It contains only the game's rendered interface. The selected screenshot is retained locally with its source checksum. It is a poster for the linked September 15 developer video, not a frame extracted from that newer video.

The SVG identity mark was drawn for this project in code. Engine guide marks are simple typographic labels, not official engine logos.

## Typography

Barlow Regular and Barlow Condensed SemiBold are by The Barlow Project Authors, copyright 2017. The unchanged font files were retrieved from the Google Fonts repository on September 15, 2026:

- [Barlow Regular source](https://github.com/google/fonts/blob/main/ofl/barlow/Barlow-Regular.ttf)
- [Barlow Condensed SemiBold source](https://github.com/google/fonts/blob/main/ofl/barlowcondensed/BarlowCondensed-SemiBold.ttf)
- [Barlow project](https://github.com/jpt/barlow)

The fonts are distributed under the **SIL Open Font License 1.1**, retained in [`assets/fonts/OFL.txt`](../assets/fonts/OFL.txt). The repository's MIT license does not replace the font license. Browser fallback fonts are system fonts and are not distributed.

## License scope

The site's code, text, SVG mark and original project artwork are covered by the root project license to the extent rights are held. AI-generated material may not carry copyright protection in every jurisdiction. No exclusivity or third-party rights clearance is asserted. The Barlow fonts retain their OFL license. The linked YouTube video and the OpenAI, Tokyo AI and engine names are not relicensed by the site's project license.

## Source checksums

```text
c778847f0d0660dc760df788f563613a4c3df72e1bbc3cf5b1e33a33b685193f  crossing.png
b07fbec97fa34971a9eecc192917b0e6c395ad4a44b90b61b332638b80c1b1d3  warehouse.png
ac05de2cdbc1f963f6f5f761b7e0409edf3aad6b7b0024735a474e20450d623f  relay.png
67e4e6fac505733ce3a2df41b8648220f7afcc648506312c715719b29769b197  emberwake-map.png
6a64016b50b04fa3d28091038009ce0d38555968ec728d5b7e169ed888bde641  emberwake-gameplay.jpg
```

## Selected web asset checksums

```text
e58682746e862f039c6986d7c1cd61438fffd144267d01413e257a1533443e58  crossing.webp
7e3858e999cd24e92a3400e7c5863c64adc09ec466a757085cf1f485a39b93f5  crossing-mobile.webp
22faa8a6e6eef626f501ca9c05d6cabc28fb5e7352f36f1c118aae571e5a6e26  warehouse.webp
d55668678a1db15a56b722b0f87a1a7812bdb34e72e7da969ef5ed33a608d8dd  relay.webp
5abc6f56a983f3bcc4472cd985e99f3e68219f916e1eac9c9798fef3bda10df0  emberwake-map.webp
93cd09fe040e8df0fe413df9a9c62157bad3c3b57a0a56ed6910b313cc07c686  emberwake-gameplay.webp
7b619d14bc2327509a9ef32b0890f709626f7ecc9ff61191c2a4314c5499d2d9  fonts/barlow-condensed-semibold.ttf
95aa02c7c43096e0dd44d787ba6216864a67157e402adab59b35572e0c1577ea  fonts/barlow-regular.ttf
186d750eb496a4c17a76385f82be6aea2ac1cf2de074a811d63786cf374ea73f  fonts/OFL.txt
```
