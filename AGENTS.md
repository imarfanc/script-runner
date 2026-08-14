# WhatsApp Sender

This is a Deno-native local WhatsApp Desktop sender. Use Deno tasks and run `deno task check` before
handing off changes.

## Frontend structure

- Keep the HTML and generated DOM as simple and shallow as possible.
- Avoid unnecessary wrapper elements, duplicated layout trees, and abstractions that add DOM nodes
  without improving semantics or accessibility.
- Preserve stable, descriptive IDs on major layout and interactive elements. Use classes and
  `data-*` attributes for repeated elements where IDs cannot be unique.

## Platform notes

- Sends go through the Swift sources in [`data/whatsapp/`](data/whatsapp/) (Accessibility UI
  automation of WhatsApp Desktop; compiled with `swiftc` on demand).
- Group names in [`data/groups.yaml`](data/groups.yaml) must match WhatsApp chat titles exactly.
- Grant macOS Accessibility to the process that launches Deno, or AX calls will fail.
