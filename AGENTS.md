# Script Runner

This is a Deno-native local script runner. Use Deno tasks and run `deno task check` before handing
off changes.

## Frontend structure

- Keep the HTML and generated DOM as simple and shallow as possible.
- Avoid unnecessary wrapper elements, duplicated layout trees, and abstractions that add DOM nodes
  without improving semantics or accessibility.
- Preserve stable, descriptive IDs on major layout and interactive elements. Use classes and
  `data-*` attributes for repeated elements where IDs cannot be unique.
