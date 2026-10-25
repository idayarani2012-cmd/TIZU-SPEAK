---
name: french-speaking-practice
description: Builds a spoken French role-play practice page for a class. Asks the level, number of students and dialogue context, then makes a page that speaks, listens and corrects.
---

# French speaking practice

The user is a French teacher in Indian schools (CBSE/ICSE, Classes 6–12). This skill produces ONE self-contained HTML page where a "bot" plays a character in a role-play, speaks French aloud, listens to the student's spoken answer, checks it and gives short English tips. The teacher puts the page online free with Netlify Drop and students open it on their phones.

Files in this skill folder (use them, do not rewrite the page from scratch):

| File | Purpose |
|---|---|
| `template.html` | The whole page. Contains `{{TITLE}}` and `{{LESSON_JSON}}` placeholders. Microphone engine, text-to-speech, answer checker, screens, teacher space. |
| `build.py` | Tests the lesson, inserts it into the template, writes the page and the Netlify ZIP. |
| `check_lesson.js` | Test runner used by `build.py` (needs Node). |
| `lessons/cafe-a1.json` | Worked example (A1, café). Copy its structure for every new lesson. |

## Step 1. Ask three questions, in ONE message

Before writing anything, ask:

1. **Level**: A1, A2, B1 — or a class (e.g. Class 8).
2. **Number of students** in the class (the page gives them Élève 1 … Élève N).
3. **Context of the dialogue**, for example "ordering a coffee in a French café".

If the teacher already gave one of these clearly, confirm it in the same message instead of asking again. If they give a class, map it and say so: Classes 6–8 → A1, Classes 9–10 → A2, Classes 11–12 → B1.

## Step 2. Write the dialogue

- Length by level: **A1 = 6–8 turns, A2 = 7–9, B1 and above = 8–10.** One turn = one bot line + the answer expected from the student. `build.py` refuses other lengths.
- Natural French at the right level, suitable for school students (no alcohol, dating, politics). Use **real French places** (Café de Flore, Gare de Lyon, Marché d'Aligre, Pharmacie… in a real arrondissement, Musée d'Orsay, etc.).
- Short bot lines at A1 (one idea each). The bot is always « vous » to the student unless the context is friends.
- The first turn is the bot greeting; the last turn is a polite goodbye.

### Golden rule: every bot line must make sense WHATEVER the student said before

Read each bot line and ask: "Is this still sensible if the student answered with something different, or something unexpected?" Never ask a question that only fits one particular earlier answer. Example: a student who ordered a sandwich must not be asked « avec du lait ? ».

Solutions, in order of preference:

1. Rewrite the line so it is neutral (« Vous désirez autre chose ? »).
2. Give the turn **variants**: each variant has a `when` condition on the words of an **earlier** answer, and replaces `bot`, `en`, `model`, `hint`, `required`. The turn's own fields are the default, used when no variant matches. Make variants mutually exclusive and keep a sensible default for "both", "neither" and "nonsense".
3. Use `skipIf` to skip a turn that does not apply.

Open questions (« Qu'est-ce que vous désirez ? ») must accept food as well as drinks.

## Step 3. Write the lesson JSON

Save it as e.g. `lesson.json` (outside the skill folder, in your working directory). Copy `lessons/cafe-a1.json` and change it. Fields:

```
id, title, level ("A1"|"A2"|"B1"|"B2"), students (number), scene_en (scene in English),
lists:  { name: [words…] }            reusable word lists, referred to as "@name"
commonMistakes: [ {id, any|re, tip} ] checked on EVERY turn
turns: [ {
  id: "t1", bot, en, model, hint,
  required: [ {label, eg, any:[accepted words/phrases or "@list"]} ],   each = one required element
  mistakes: [ {id, any:[…] | re:"regex", unless:[…], tip} ],           turn-specific typical mistakes
  variants: [ {name, when: cond | [cond…], bot, en, model, hint, required, mistakes} ],
  skipIf: cond
} ],
tests: { mistakes: [[turnId, "text with the mistake", mistakeId, {optional earlier answers}]],
         branches: [[turnId_answered, "answer", turnId_asked, "text the bot line must contain"]],
         english: [ optional list of English sentences ] }
```

A condition is `{turn:"t2", any:[…]|"@list", none:[…]|"@list", re:"regex"}` and may only refer to an EARLIER turn. It looks at the student's best answer to that turn. A list of conditions means AND.

### How answers are compared

Text is lowercased, accents removed, all punctuation and apostrophes turned into spaces (« s'il vous plaît » → `s il vous plait`, « l'addition » → `l addition`). Words and phrases in `any` lists are normalised the same way and must match **whole words**. Regexes (`re`) run on that normalised text surrounded by spaces, so write them without accents and use `\\b` (double backslash in JSON).

### Scoring (0–3 per turn)

- Required elements found: all → 3, at least half → 2, some → 1, none → 0.
- Minus 1 per typical mistake shown (maximum minus 2).
- Mostly English answers are capped at 1. English words in an otherwise French answer count as a mistake (built in, id `english`).
- Missing elements only lower the score and become tips. The student is never blocked.

### What to put in the lists

- **required**: 2–3 elements per turn, each described by a short English `label`, an example `eg`, and all the words a good answer could use (synonyms, both genders, with and without elision). Be generous for open questions.
- **Typical mistakes of Indian learners** (write the ones that fit the context, each with a one-line English tip): noun gender (une café, un limonade), missing articles, partitive du/de la/de l' vs un/une, tu vs vous with adults and staff, je veux vs je voudrais, verb endings (je prend, je voudrait), infinitive after pouvoir/vouloir (je peux payé), bon/bonne, c'est + adjective, elision (je habite), prepositions with cities and countries (en Paris), and English words.
- **Every mistake id must appear in `tests.mistakes`.** `build.py` fails otherwise.

## Step 4. Build and test (never skip)

```
python3 <skill folder>/build.py lesson.json --out <output folder>
```

`build.py` first runs `check_lesson.js`, which tests the answer checker and refuses to build if anything fails:

- the model answer of every turn and every variant gets full marks (also typed without accents, punctuation or capitals);
- every typical mistake shows its tip and lowers the score;
- English answers score 0 or 1 on every turn;
- every variant and the default of each branching turn is reached by `tests.branches`, and the right bot line is chosen;
- the lesson has the right number of turns for its level, ids are unique, conditions point to earlier turns.

Read the failures, fix the lesson (usually a missing word in an `any` list or a regex typo), and rebuild until it prints `0 failed`. If Node is not available, say so honestly and do not claim the checker was tested.

Outputs, written to the output folder:

- `<slug>.html`: the page itself;
- `<slug>-netlify.zip`: a ZIP containing the folder `<slug>/` with the page saved as `index.html`.

Do not edit `template.html` unless the teacher asks for a change to the page. Its microphone engine follows strict rules (a new recognition object for every answer, abort previous + cancel speech + 350 ms wait, never disable the mic, ignore taps while starting, 700 ms after a final result, 1.2 s forced end after a stop tap, 15 s limit, one automatic retry, clear error messages). If you must change it, re-run the build so the tests still pass.

## Step 5. Deliver and explain

Hand over both files (attach them; do not just print their paths). Then tell the teacher, briefly:

1. What the lesson contains (title, level, number of turns, any branches) and that the checker tests passed.
2. **The microphone only works from an https:// link.** If the page is opened as a file from a computer or phone, speaking will not work (typing still does).
3. How to get a free https link with **Netlify Drop**:
   - open **app.netlify.com/drop** in a browser;
   - drag the unzipped folder (or the ZIP) onto the page;
   - Netlify gives a link like `https://something.netlify.app`; open it on the phone, tap **Tester le micro**, then share the link with the class;
   - log in with a free Netlify account to keep the site (a site dropped without an account may be deleted after a short time).
4. Students should use **Google Chrome** (Android or computer) or **Safari on iPhone with Siri turned on**.
5. The teacher's results (**Espace prof**) are saved only on the device and browser used by the students. For a whole class on one shared device, use the student dropdown; if students use their own phones, each phone keeps its own results.
