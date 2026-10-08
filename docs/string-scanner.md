# String Scanner

String Scanner finds maximal contiguous runs of allowed characters within a byte
range. It operates read-only on the existing worker document session.

## Encodings and filters

- ASCII accepts only bytes 20–7E.
- Windows-1252, CP437, CP850 and Shift-JIS use existing strict character codecs.
- Letters and combining marks are accepted. Optional filters accept Unicode space
  separators (Zs), numbers (N), and punctuation/symbols (P/S). Controls, line breaks
  and invalid byte sequences always end a run. No Unicode normalization occurs.
- Disabled categories delimit strings; they are not removed from text.
- Shift-JIS consumes a valid character completely. After an invalid sequence,
  scanning resumes at the next byte. An incomplete character at EOF is excluded.
- Range boundaries are hard boundaries; a range beginning inside a multibyte
  character cannot recover its preceding byte.

## Length and addressing

Minimum length defaults to 4 Unicode code points. An optional maximum excludes an
entire longer run rather than splitting it. Alignment applies to the absolute
start offset of a maximal run; it does not manufacture aligned suffixes.
Offsets and result `length` always count bytes; `characterLength` counts code points.
Start is inclusive and end exclusive.

## Bounded results

Each result provides encoding, full character/byte lengths, and original preview
bytes. Text previews are limited to 256 code points and byte previews to 512 bytes,
ending at a character boundary. `previewTruncated` indicates partial previews.
The complete `offset + length` range remains part of each result, including truncated
results. The default maximum result count is 10,000; existing IPC policies apply.

The scanner caches decoded character tokens, not ROM-sized text. Progress uses
processed bytes in the requested range, with approximately 100 updates (at least
4 KiB apart). Cancellation is checked at least every 4 KiB and around callbacks.
Result batches contain at most 128 items. A result limit can end scanning before
100% progress. Existing job ownership, cancellation, pagination and sessions apply.

These are readable candidates, not proof of dialogue: standard encodings cannot
discover arbitrary proprietary game tables, pointers, or platforms.
