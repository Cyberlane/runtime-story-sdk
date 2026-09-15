# Runtime Story SDK showcase

A static GitHub Pages site for the OpenAI × Tokyo AI 100-Hour Game Challenge entry. It uses original painted worlds, a command-console walkthrough and actual Emberwake gameplay to explain the developer tool.

## Run locally

From the repository root:

```sh
npm ci
npm run site:dev
```

Open the URL printed by the server. The site is plain HTML, CSS and JavaScript. There is no build step, client framework, backend, analytics, cookie storage or remote font request.

`npm run site:check` checks local references and submission-facing site structure. The root GitHub Actions workflow deploys the static files to `https://cyberlane.github.io/runtime-story-sdk/`. Publication and workflow status are verified separately from local checks.

## Structure

| Path                   | Purpose                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `index.html`           | Page content, navigation, image alternatives and no-JavaScript fallback links |
| `style.css`            | Layout, type, responsive behavior and reduced-motion overrides                |
| `app.js`               | Four-state educational walkthrough and click-to-load YouTube player           |
| `assets/`              | Optimized WebP art, original SVG mark and locally hosted fonts                |
| `art-direction/`       | Exact image-generation prompts, source attribution and checksums              |
| `generated-originals/` | Local source image retention, excluded from Git and deployment                |

All local asset references are relative. All repository and guide links target the public GitHub repository. The page therefore works at the GitHub Pages project prefix without a bundler or a hard-coded asset root.

## Design

The composition starts with the developer promise and a painted fantasy crossing. The middle shifts into a restrained tactical console, then a large actual gameplay/video feature, three distinct world paintings and practical integration entry points. Gold connects actions and accepted terms. Cool green distinguishes a changed route. There are no imitation franchise logos or borrowed game interface assets.

Artwork is promotional concept art. The video poster is an actual retained Emberwake gameplay capture. The small map in the console is a real game environment asset, with an illustrative route overlay. It is not a live SDK execution.

The lifecycle explorer deliberately performs no inference or game actions. Its static example states distinguish proposal, acceptance, committed effects and revision. UI changes use `textContent` and constructed DOM nodes. There is no HTML interpolation, timer-driven fake inference or access to credentials.

## Accessibility and playback

- Semantic landmarks, one page heading, descriptive section headings and a skip link.
- Visible keyboard focus on links and buttons.
- Lifecycle tabs support Left/Right, Home/End and native Tab navigation. The selected tab labels the single content panel.
- The next-step control moves focus to the newly selected tab so keyboard and screen-reader users can follow the state change.
- Responsive layouts at 1120, 850 and 580 pixels. The narrow layout stacks the world art and installation content.
- No autoplay background motion or sound. `prefers-reduced-motion` removes transitions and smooth scrolling.
- Meaningful image alternatives. Decorative marks, repeated route graphics and symbols are hidden from assistive technology.
- The YouTube player is created only after explicit activation. With JavaScript disabled, the poster opens the normal YouTube link. Modifier-click behavior is preserved.

Run a real browser review at desktop and narrow widths after changing copy or styles. Verify the entire page, each lifecycle state, keyboard focus, video activation and all engine links. Local source checks do not establish video availability or external link accessibility.

## Performance and assets

The selected WebP images are approximately 1 MB combined. The mobile hero is 820 pixels wide and about 64 KB. Images below the hero use lazy loading and explicit dimensions. Barlow fonts are hosted locally under the SIL Open Font License.

High-resolution originals remain in the ignored local `generated-originals/` directory, with the built-in generation outputs also retained separately. They are not needed to view or deploy the site. The GitHub Pages artifact must exclude this directory.

To regenerate a WebP derivative, use the retained original and `cwebp`. For example:

```sh
cwebp -q 85 site/generated-originals/crossing.png -o site/assets/crossing.webp
cwebp -q 78 -resize 820 0 site/generated-originals/crossing.png -o site/assets/crossing-mobile.webp
```

New artwork should retain its original, exact prompt and selection record. See [provenance and licenses](art-direction/PROVENANCE.md). Project code and original project artwork use the root license to the extent rights are held. Font files retain their own OFL license. The externally hosted video is not relicensed by this site.
