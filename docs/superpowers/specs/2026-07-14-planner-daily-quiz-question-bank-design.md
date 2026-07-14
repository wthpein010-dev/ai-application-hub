# Daily Quiz Question Bank Design

## Goal

Add a read-only question-bank browser to the `planner-daily-quiz` administrator panel. After entering the existing administrator password, an administrator can browse every question with its answer and explanation.

## Scope

- Keep the current password, answer-record refresh, and JSON copy actions.
- Add two administrator views: `答题记录` and `题库查阅`.
- Add keyword search and category filtering to the question-bank view.
- Show question number, category, question type, difficulty, stem, options, correct answer, explanation, and tags for each question.
- Do not add question editing, deleting, importing, or any backend dependency.

## Data And Access Boundary

The view uses the existing in-memory `state.questions` collection, loaded from `data/questions.json`. The password continues to gate the management interface only; a GitHub Pages static JSON file is publicly retrievable and is not server-protected.

## Behaviour

- Successful login opens `答题记录` by default and keeps the login form out of the way.
- `题库查阅` renders all loaded questions and fills its category filter from the same data.
- Keyword matching covers the question stem, category, tags, and options.
- Selecting a category and typing a query combine as an AND filter.
- A no-results state explains that no question matches the current filters.
- Cards use a single responsive column on Windows and macOS current browsers; filters wrap to one column on narrow screens.

## Acceptance Criteria

1. The existing administrator password unlocks the management content.
2. The question-bank view shows every JSON question with its correct answer and explanation.
3. Search and category filters work together and show an empty state when necessary.
4. Existing record refresh and JSON copy interactions remain available.
