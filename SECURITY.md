# Security

This project is an offline research tool: it reads local files, writes local files, and makes network requests only in
`fetch-data` (NASA POWER hourly data and a TMYx cross-check file, with hashes checked afterwards). It has no server and
no accounts.

Report a vulnerability (for example an input file that can make the CLI write outside its output directory, or markup that the
report fails to escape) by email to the repository owner or through GitHub private vulnerability reporting, not in a public issue.
Include the command and the smallest input that shows it.
