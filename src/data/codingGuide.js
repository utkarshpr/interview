// Suggested approach + "what to verify" for every coding exercise.
// Curated hints in catalog.json always win; these rules fill the gaps for the rest.
// Rules are matched against the exercise title and topic, first match wins.

const ALGO = { bruteForce: 'Simplest version', optimized: 'Optimized version', labels: ['Brute force', 'Optimized'] };
const BUILD = { labels: ['Simple version', 'Production-ready version'] };

const rules = [
  // ---- SQL ----
  { re: /second-highest|nth highest|top \d|highest salary|per department|every department/i, kind: 'sql', pattern: 'Ranking with window functions or a subquery',
    hints: ['Decide how ties should behave: RANK, DENSE_RANK or ROW_NUMBER give different answers.', 'A correlated subquery works for small data; PARTITION BY avoids repeating the scan.', 'Check the empty and single-row cases: should the result be NULL or no row?'],
    approach: { bruteForce: 'Sort the whole table with ORDER BY and pick rows with LIMIT/OFFSET.', optimized: 'Use DENSE_RANK() OVER (PARTITION BY ... ORDER BY ... DESC) and filter on the rank.', complexity: 'One sort per partition' },
    checks: ['Two rows tie for the top value', 'Only one row exists in the group', 'The table is empty', 'A department has fewer rows than N'] },
  { re: /duplicate|fraud/i, kind: 'sql', pattern: 'GROUP BY ... HAVING COUNT(*) > 1',
    hints: ['Group by the columns that define "the same" and count each group.', 'HAVING filters groups after aggregation; WHERE filters rows before it.', 'To list the duplicate rows themselves, join the groups back to the table.'],
    approach: { bruteForce: 'Self-join the table on all key columns and compare ids.', optimized: 'GROUP BY the key columns with HAVING COUNT(*) > 1.', complexity: 'One scan plus a hash or sort' },
    checks: ['No duplicates at all', 'Three or more copies of the same row', 'Rows that match on some columns but not all', 'NULL values in the key columns'] },
  { re: /never placed|no orders|without managers|missing|not in/i, kind: 'sql', pattern: 'Anti-join (LEFT JOIN ... IS NULL / NOT EXISTS)',
    hints: ['LEFT JOIN keeps every row from the left table; unmatched rows have NULLs on the right.', 'Filter on a column of the right table that cannot be NULL when a match exists.', 'NOT IN returns nothing if the subquery contains a NULL; prefer NOT EXISTS.'],
    approach: { bruteForce: 'For each row run a subquery that counts matches.', optimized: 'LEFT JOIN with IS NULL, or NOT EXISTS, backed by an index on the join key.', complexity: 'One indexed join' },
    checks: ['Every row has a match', 'No row has a match', 'NULLs in the join column', 'Duplicate matches for one row'] },
  { re: /consecutive|streak|gaps|sequential|time series|overlap/i, kind: 'sql', pattern: 'Gaps and islands',
    hints: ['Number the rows per group with ROW_NUMBER().', 'date - row_number is constant inside a run of consecutive days: that is the island key.', 'Group by the island key and keep islands of the required length.'],
    approach: { bruteForce: 'Self-join once per day in the streak.', optimized: 'ROW_NUMBER() islands: GROUP BY user, (date - row_number) and HAVING COUNT(*) >= N.', complexity: 'One sort per partition' },
    checks: ['Duplicate rows for the same day', 'A gap exactly at the boundary', 'A streak that is exactly the required length', 'Two separate streaks for one user'] },
  { re: /running|cumulative|moving|rolling|balance|monthly|ohlc|candle|aggregat/i, kind: 'sql', pattern: 'Window functions and time bucketing',
    hints: ['SUM(...) OVER (PARTITION BY ... ORDER BY ...) gives running totals.', 'Use ROWS BETWEEN n PRECEDING AND CURRENT ROW for moving windows.', 'Bucket time with strftime (SQLite) or date_trunc (PostgreSQL) before grouping.'],
    approach: { bruteForce: 'Correlated subquery that re-sums all earlier rows for each row.', optimized: 'A single window function pass over the ordered partition.', complexity: 'One sort, one pass' },
    checks: ['Rows with equal timestamps (add a tie-breaker)', 'First row of each partition', 'A single-row partition', 'Negative amounts'] },
  { re: /pagination|keyset|cursor|latest .* per/i, kind: 'sql', pattern: 'Keyset (seek) pagination',
    hints: ['OFFSET gets slower the deeper the page; WHERE id > :last_id does not.', 'Order by a unique, indexed column (add id as a tie-breaker).', 'Return the last row\'s key so the client can ask for the next page.'],
    approach: { bruteForce: 'ORDER BY ... LIMIT n OFFSET k.', optimized: 'WHERE (sort_col, id) > (:last_sort, :last_id) ORDER BY sort_col, id LIMIT n.', complexity: 'Index seek per page' },
    checks: ['First page (no cursor)', 'Last partial page', 'Rows inserted between page requests', 'Ties in the sort column'] },
  { re: /\bsql\b|query|join|explain|select/i, kind: 'sql', pattern: 'Query plan thinking',
    hints: ['Write the correct query first, then read EXPLAIN (ANALYZE).', 'Index the columns used in WHERE, JOIN and ORDER BY, most selective first.', 'Avoid functions on indexed columns in WHERE; they prevent index use.'],
    approach: { bruteForce: 'Full table scan with filtering in the application.', optimized: 'Push filters into SQL, add a covering or composite index, verify with EXPLAIN.', complexity: 'Index seek instead of scan' },
    checks: ['Plan uses an index scan, not a sequential scan', 'Result is identical before and after the change', 'Behavior with NULLs and empty tables', 'Latency on a large generated dataset'] },

  // ---- Algorithmic Go ----
  { re: /\breverse\b(?! proxy)|palindrome|\brotate\b|two pointers|\bsplit/i, kind: 'algo', pattern: 'Two pointers / in-place swap',
    hints: ['Place one index at each end and move them toward the middle.', 'Strings in Go are immutable bytes: convert to []rune to handle Unicode safely.', 'Rotating by k is the same as reversing three segments; use k % n first.'],
    approach: { ...ALGO, bruteForce: 'Build a new slice or string by copying elements in the new order.', optimized: 'Swap in place with two indexes.', complexity: 'O(n) time, O(1) extra space' },
    checks: ['Empty input and a single element', 'Even and odd lengths', 'k larger than n or equal to 0', 'Unicode or mixed-case text'] },
  { re: /duplicate|frequency|\bcount\b|\bgroup\b|\bcommon\b|anagram|\bset\b|\bword\b/i, kind: 'algo', pattern: 'Hash map / set counting',
    hints: ['A map from value to count answers most "how many / which repeats" questions in one pass.', 'A map[T]struct{} is a set. Iteration order of maps is random in Go, so sort keys before printing.', 'Decide what "duplicate" means for the output: first occurrence, all occurrences, or distinct values.'],
    approach: { ...ALGO, bruteForce: 'Compare every pair of elements.', optimized: 'Single pass with a map of seen values or counts.', complexity: 'O(n) time, O(n) space' },
    checks: ['No duplicates', 'Everything is a duplicate', 'Negative numbers and zero', 'Large n (performance)'] },
  { re: /second-largest|\blargest\b|\bsmallest\b|missing number|\bmaximum\b|\bminimum\b|\bmax\b|\bmin\b|subarray|\bsum\b/i, kind: 'algo', pattern: 'Single pass with tracked state',
    hints: ['Keep a few variables (best, second best, running sum) and update them as you scan.', 'Initialise from the first element, not 0, so negative inputs work.', 'For "missing number" the arithmetic sum n(n+1)/2 or XOR avoids extra memory.'],
    approach: { ...ALGO, bruteForce: 'Sort a copy and read the answer from the sorted order.', optimized: 'One scan keeping only the state you need.', complexity: 'O(n) time, O(1) space' },
    checks: ['All elements equal', 'All negative values', 'Single element', 'The answer is the first or last element'] },
  { re: /\bmerge\b|\bsort\b|\bsorting\b|\bsorted\b|interval|binary search/i, kind: 'algo', pattern: 'Sorting and merging',
    hints: ['If inputs are already sorted, walk both with two indexes instead of re-sorting.', 'For intervals, sort by start and extend the last interval while the next one overlaps.', 'Decide whether touching endpoints count as overlapping.'],
    approach: { ...ALGO, bruteForce: 'Concatenate and sort everything again.', optimized: 'Linear merge with two pointers, or sort once then sweep.', complexity: 'O(n + m) merge, O(n log n) with a sort' },
    checks: ['One of the inputs is empty', 'Intervals that touch at an endpoint', 'One interval contains all others', 'Unsorted input order'] },
  { re: /linked list|cycle|node/i, kind: 'algo', pattern: 'Pointer manipulation',
    hints: ['Draw the list and the pointers before and after one step.', 'Keep prev, curr and next variables so you never lose the rest of the list.', 'Floyd\'s slow/fast pointers detect cycles in O(1) space.'],
    approach: { ...ALGO, bruteForce: 'Copy values into a slice, work on it, rebuild the list.', optimized: 'Rewire pointers in place.', complexity: 'O(n) time, O(1) space' },
    checks: ['Empty list and single node', 'Two nodes', 'Cycle pointing at the head', 'Very long list'] },
  { re: /stack|queue|heap|deque/i, kind: 'algo', pattern: 'Data structure with an invariant',
    hints: ['Write down the operations and the invariant each must keep (for example "top is the minimum").', 'A slice is a fine stack; for a queue avoid re-slicing from the front forever.', 'Define behaviour on empty: return an error, a zero value or ok=false.'],
    approach: { ...ALGO, bruteForce: 'Recompute the answer from all elements on every call.', optimized: 'Maintain extra state so every operation is O(1) (or O(log n) for a heap).', complexity: 'O(1) per operation for stack/queue' },
    checks: ['Operations on an empty structure', 'Push then pop the same value', 'Interleaved operations', 'Capacity growth with many elements'] },
  { re: /lru|lfu|cache|key-value|kv store/i, kind: 'algo', pattern: 'Hash map plus ordering structure',
    hints: ['A map gives O(1) lookup; a doubly linked list (container/list) gives O(1) recency updates.', 'Store the list element in the map so you can move or delete it without searching.', 'Decide what counts as a use: get only, or put on an existing key as well.'],
    approach: { ...ALGO, bruteForce: 'Scan a slice of entries for the oldest or least-used key on each eviction.', optimized: 'Map + doubly linked list (LRU) or frequency buckets (LFU), all operations O(1).', complexity: 'O(1) get and put' },
    checks: ['Capacity of 1', 'Updating an existing key', 'Eviction order after several gets', 'Get of a missing key'] },
  { re: /\btrees?\b|\bbst\b|\bgraphs?\b|\bbfs\b|\bdfs\b|\btrie\b/i, kind: 'algo', pattern: 'Tree / graph traversal',
    hints: ['Recursion mirrors the structure; use an explicit stack or queue if depth can be large.', 'BFS gives shortest paths in unweighted graphs; DFS is simpler for reachability.', 'Track visited nodes to avoid cycles in graphs.'],
    approach: { ...ALGO, bruteForce: 'Repeat the full traversal for every query.', optimized: 'One traversal that records what later steps need.', complexity: 'O(V + E)' },
    checks: ['Empty tree or graph', 'Single node', 'Skewed tree (a linked list)', 'Disconnected components'] },

  { re: /climb|stairs|knapsack|subsequence|coin change|house robber|\bdp\b|edit distance|unique paths|longest|partition|min path|grid path|catalan|fibonacci/i, kind: 'algo', pattern: 'Dynamic programming',
    hints: ['Define the state in words: "dp[i] is the best answer for the first i items".', 'Write the recurrence from the last choice, then the base cases.', 'Once it works, check whether only the last row or two of the table is needed.'],
    approach: { ...ALGO, bruteForce: 'Plain recursion that tries every choice (exponential).', optimized: 'Memoize the recursion, or fill a table bottom-up and shrink the space.', complexity: 'Number of states × work per state' },
    checks: ['The smallest input (n = 0 or 1)', 'A case where greedy would give the wrong answer', 'Large n (no deep recursion, no overflow)', 'Impossible target values'] },
  { re: /greedy|assign cookies|jump game|activity selection|candy|platform|meeting rooms?|shortest job|fractional|job sequencing|gas station|lemonade/i, kind: 'algo', pattern: 'Greedy choice',
    hints: ['Sort by the criterion that makes the locally best choice safe.', 'Argue (even informally) why taking the best option now never hurts later.', 'Try to break your rule with a small counter-example before coding.'],
    approach: { ...ALGO, bruteForce: 'Try every ordering or subset and keep the best.', optimized: 'Sort once, then make one pass taking the greedy choice at each step.', complexity: 'O(n log n) for the sort' },
    checks: ['Ties in the sort key', 'All items identical', 'No valid choice exists', 'A tricky case where the first choice is not optimal'] },
  { re: /permutation|subsets?|combination|n-queen|sudoku|backtrack|generate parentheses|word search|rat in a maze|palindrome partition/i, kind: 'algo', pattern: 'Backtracking',
    hints: ['Choose, explore, un-choose: modify the state, recurse, then undo the change.', 'Prune early: stop a branch as soon as it cannot lead to a valid answer.', 'Copy the current path only when you record a complete answer.'],
    approach: { ...ALGO, bruteForce: 'Generate every candidate, then filter the valid ones.', optimized: 'Backtrack with pruning and a visited set so invalid branches die early.', complexity: 'Exponential, but pruning shrinks the search' },
    checks: ['Empty input', 'Duplicate elements (no repeated results)', 'The smallest non-trivial size', 'Output order if the problem fixes one'] },
  { re: /\bbits?\b|\bxor\b|power of (?:two|2)|set bits?|swap two numbers|single number/i, kind: 'algo', pattern: 'Bit manipulation',
    hints: ['x & (x - 1) clears the lowest set bit; x & -x isolates it.', 'XOR cancels equal values, which finds the one that appears once.', 'Use unsigned types for shifts and watch the sign bit.'],
    approach: { ...ALGO, bruteForce: 'Loop over the digits or use a map.', optimized: 'Use bitwise operators for O(1) space and often O(1) time.', complexity: 'O(1) space' },
    checks: ['Zero', 'Negative numbers', 'The largest value of the type', 'Powers of two and their neighbours'] },
  { re: /matrix|spiral|rotate image|number of islands|flood fill|zero matrix|2d/i, kind: 'algo', pattern: 'Matrix traversal',
    hints: ['Keep boundaries (top, bottom, left, right) or a direction array [[0,1],[1,0],[0,-1],[-1,0]].', 'Check bounds before every access.', 'Transpose then reverse rows for a 90 degree rotation, in place.'],
    approach: { ...ALGO, bruteForce: 'Copy into a new matrix and fill it.', optimized: 'Work in place with boundary pointers or a visited marker.', complexity: 'O(rows × cols)' },
    checks: ['1×1 and 1×n matrices', 'Non-square matrices', 'All cells equal', 'Cells on the border'] },
  { re: /substring|prefix|parenthes|roman|atoi|valid|longest common|string/i, kind: 'algo', pattern: 'String scanning',
    hints: ['Scan once with indexes; a sliding window or a stack handles most string problems.', 'Convert to []rune if non-ASCII input is possible.', 'Use strings.Builder when building output in a loop.'],
    approach: { ...ALGO, bruteForce: 'Check every substring or pair of positions.', optimized: 'One pass with a window, a stack or a counter array.', complexity: 'O(n) time, O(1) to O(n) space' },
    checks: ['Empty string and one character', 'All characters the same', 'Mixed case and spaces', 'Very long input'] },
  { re: /prime|gcd|lcm|armstrong|digits?\b|factorial|sqrt|\bpow\b|divisor|perfect number|palindrome number/i, kind: 'algo', pattern: 'Number theory basics',
    hints: ['Test divisors only up to the square root.', 'Use the Euclidean algorithm for gcd; lcm = a / gcd × b.', 'Watch for overflow: use int64 or the math/big package when values grow.'],
    approach: { ...ALGO, bruteForce: 'Try every number up to n.', optimized: 'Stop at the square root, or use a sieve when you need many primes.', complexity: 'O(√n)' },
    checks: ['0, 1 and 2', 'Negative numbers if allowed', 'The largest input in the constraints', 'Perfect squares'] },

  // ---- Concurrency & errors ----
  { re: /goroutine|channel|mutex|worker pool|producer-consumer|waitgroup|\bselect\b|\brace\b|deadlock|concurrent|thread-safe|semaphore|fan-/i, kind: 'build', pattern: 'Concurrency: ownership, synchronization, shutdown',
    hints: ['Decide who owns each piece of shared data: one goroutine, or a mutex.', 'Every goroutine you start needs a clear way to stop (context, closed channel, WaitGroup).', 'Run with go run -race while you build it.'],
    approach: { ...BUILD, bruteForce: 'Run the work sequentially and get the output right first.', optimized: 'Add goroutines, bound them with a worker pool, and make shutdown deterministic.' },
    checks: ['go run -race reports no data race', 'Results are correct with 1 worker and with many', 'No goroutine leak after finishing (check runtime.NumGoroutine)', 'Cancellation stops the work promptly'] },
  { re: /error|panic|context|timeout|cancel|retr(?:y|ies)|recover|graceful|circuit|backoff/i, kind: 'build', pattern: 'Errors, context and failure handling',
    hints: ['Return errors with context (fmt.Errorf("...: %w", err)) and check them with errors.Is / errors.As.', 'Pass context.Context as the first argument and honour ctx.Done() in every blocking call.', 'Retries need a limit, backoff with jitter, and must only repeat idempotent work.'],
    approach: { ...BUILD, bruteForce: 'Handle the happy path and return the first error unchanged.', optimized: 'Wrap errors with context, propagate cancellation and deadlines, retry only transient failures.' },
    checks: ['A failing dependency returns a wrapped, inspectable error', 'A cancelled context stops work within the deadline', 'Retries stop after the limit', 'A panic is recovered and turned into an error response'] },

  // ---- Backend building ----
  { re: /\brest\b|http|\bapi\b|crud|gin|middleware|jwt|auth|handler|grpc|server|endpoint|rate limit/i, kind: 'build', pattern: 'HTTP service layering',
    hints: ['Separate handler (HTTP), service (rules) and repository (storage) so each can be tested alone.', 'Validate input at the edge and return consistent status codes and error bodies.', 'Add timeouts, request IDs and structured logs from the start.'],
    approach: { ...BUILD, bruteForce: 'One handler with an in-memory map; hard-code config.', optimized: 'Layered packages, validation, auth middleware, timeouts, graceful shutdown, config from env.' },
    checks: ['curl the happy path and see the expected status and body', 'Invalid JSON and missing fields return 400', 'Unknown id returns 404; unauthenticated returns 401', 'httptest table-driven tests pass with go test -race'] },
  { re: /postgres|database|connection pool|migration|schema|table|\borm\b|\bsql\b/i, kind: 'build', pattern: 'Data access and transactions',
    hints: ['Use database/sql with a bounded pool (SetMaxOpenConns, SetConnMaxLifetime).', 'Wrap multi-step changes in a transaction and always roll back on error.', 'Use parameterised queries; never build SQL with string concatenation.'],
    approach: { ...BUILD, bruteForce: 'Single connection, queries inline, no transactions.', optimized: 'Pooled connections, repository layer, transactions, indexes, and tested migrations.' },
    checks: ['A failed step rolls the whole transaction back', 'Concurrent updates do not lose writes', 'Queries use the intended indexes (EXPLAIN)', 'Migrations apply cleanly on an empty database'] },
  { re: /redis|cache-aside|ttl|write-through|write-behind|write-around|caching|eviction/i, kind: 'build', pattern: 'Caching strategy',
    hints: ['Cache-aside: read the cache, on a miss load from the database and store with a TTL.', 'Decide how writes invalidate or update the cache, and what stale reads are acceptable.', 'Protect against stampedes with a short lock or request coalescing (singleflight).'],
    approach: { ...BUILD, bruteForce: 'Cache with a fixed TTL and delete on every write.', optimized: 'Jittered TTLs, singleflight for hot misses, negative caching, and metrics for hit rate.' },
    checks: ['First read misses, second read hits', 'A write is visible to the next read', 'Entries expire after the TTL', 'Many concurrent misses cause one database load'] },
  { re: /kafka|message|topic|partition|offset|consumer group|dlq|dead|event/i, kind: 'build', pattern: 'Reliable messaging',
    hints: ['Choose a message key so related events land in one partition and stay ordered.', 'Commit offsets only after processing succeeds; make handlers idempotent.', 'Send poison messages to a retry topic and then a dead-letter topic.'],
    approach: { ...BUILD, bruteForce: 'Produce and consume with auto-commit and no error handling.', optimized: 'Keyed messages, manual commits, idempotent handlers, bounded retries and a DLQ.' },
    checks: ['A duplicated message is processed once', 'A crash mid-processing leads to a redelivery, not a loss', 'A poison message ends up in the dead-letter topic', 'Events for one key stay in order'] },
  { re: /docker|compose|kubernetes|k8s|deploy|sigterm|helm|ci\/cd|pipeline|dockerfile|container|\blogs?\b|logging|metric|observab|health/i, kind: 'build', pattern: 'Packaging and operating a service',
    hints: ['Build small images: multi-stage build, static Go binary, non-root user.', 'Handle SIGTERM: stop accepting requests, finish in-flight work, then exit.', 'Expose health/readiness endpoints and structured logs.'],
    approach: { ...BUILD, bruteForce: 'A single-stage image that runs the binary.', optimized: 'Multi-stage, minimal base image, health checks, resource limits and graceful shutdown.' },
    checks: ['docker build succeeds and the image runs with docker run', 'docker compose up brings every dependency to healthy', 'Sending SIGTERM stops the process cleanly within the grace period', 'Logs are valid JSON with level and message'] },
  { re: /\btests?\b|testing|benchmark|profil|pprof|performance|optimi|allocation|escape|stack and heap|garbage|memory/i, kind: 'build', pattern: 'Measure first',
    hints: ['Write a benchmark or test before changing anything so you can prove the gain.', 'Use go test -bench . -benchmem and go tool pprof to find the real hotspot.', 'Check allocations with go build -gcflags=-m to see what escapes to the heap.'],
    approach: { ...BUILD, bruteForce: 'Write the straightforward implementation and a baseline benchmark.', optimized: 'Remove the measured hotspot (preallocate, reuse buffers, avoid interface boxing) and re-run the benchmark.' },
    checks: ['A benchmark records the before and after numbers', 'Tests still pass after the optimisation', 'pprof shows the hotspot you changed', 'Allocations per operation went down'] },
  { re: /generic|reflection|iterator|json|marshal|options|configuration|loader|validator|interface|oop|struct|polymorphism|embedding/i, kind: 'build', pattern: 'Go type system and API design',
    hints: ['Start from how callers will use it: write the call site first.', 'Prefer small interfaces defined where they are used; accept interfaces, return structs.', 'Use generics for containers and algorithms, not to replace simple interfaces.'],
    approach: { ...BUILD, bruteForce: 'A concrete implementation for one type.', optimized: 'Generalise with generics or interfaces and add table-driven tests for each case.' },
    checks: ['Works with at least two different types', 'Zero values behave sensibly', 'Table-driven tests cover normal and edge cases', 'The public API has doc comments and examples'] },

  // ---- Design and data modelling ----
  { re: /^design |system design|architecture|hld|lld|url shortener|pastebin|rate limiter|schema design|data model|ledger/i, kind: 'design', pattern: 'Structured system design',
    hints: ['Clarify requirements and scale first: users, reads vs writes, latency, consistency.', 'Sketch the API and data model, then the components and the request flow.', 'Pick one or two hard parts (hot keys, ordering, failures) and go deep on them.'],
    approach: { ...BUILD, bruteForce: 'A single service and a single database that meets the functional requirements.', optimized: 'Add caching, partitioning, queues and replication where the numbers demand them, and state the trade-offs.' },
    checks: ['Functional and non-functional requirements are written down', 'Back-of-envelope numbers justify each component', 'You can explain what fails when each box dies', 'You covered at least one trade-off in depth'] },
  { re: /cassandra|mongo|dynamo|nosql|document|wide-column|partition key|time-series|tick|ohlc|candle/i, kind: 'design', pattern: 'Query-driven data modelling',
    hints: ['List the queries first; model one table or collection per query pattern.', 'Choose a partition key that spreads load and bounds partition size.', 'Decide the consistency level and how duplicates or out-of-order writes are handled.'],
    approach: { ...BUILD, bruteForce: 'One table that mirrors the relational schema.', optimized: 'Denormalised, query-shaped tables with a bucketed partition key and TTLs where data ages out.' },
    checks: ['Every required query is served by one partition or one index lookup', 'No partition grows without bound', 'Writes are idempotent so retries are safe', 'Out-of-order and duplicate events are handled'] },
];

const sectionFallback = (sectionTitle = '') => {
  if (/Database/i.test(sectionTitle)) return rules.find((rule) => rule.kind === 'design' && /cassandra/.test(rule.re.source));
  if (/HLD|LLD|trading|system design/i.test(sectionTitle)) return rules.find((rule) => rule.kind === 'design');
  if (/Infrastructure/i.test(sectionTitle)) return rules.find((rule) => /docker/.test(rule.re.source));
  return null;
};

const generic = {
  kind: 'build', pattern: 'Break it down',
  hints: ['Restate the goal in one sentence and list the inputs and outputs.', 'Build the smallest version that works end to end, then improve it.', 'Write down two or three cases that would prove it works before you code.'],
  approach: { ...BUILD, bruteForce: 'A straightforward version that handles the main case.', optimized: 'Handle edge cases and failures, add tests, and clean up the structure.' },
  checks: ['The main case works from start to finish', 'An empty or invalid input is handled', 'A test or script demonstrates the result', 'You can explain the trade-offs you chose'],
};

export function guideFor(item, sectionTitle = '', topicTitle = '') {
  const text = item.text || '';
  // SQL advice only applies inside the database section (or when the title says so).
  const pool = /Database/i.test(sectionTitle) ? rules : rules.filter((entry) => entry.kind !== 'sql' || /\bsql\b|query|select|join/i.test(text));
  const designRule = rules.find((entry) => entry.kind === 'design' && entry.re.source.startsWith('^design'));
  const rule = (/^design\b/i.test(text) ? designRule : null)
    || pool.find((entry) => entry.re.test(text))
    || pool.find((entry) => entry.re.test(`${text} ${topicTitle}`))
    || sectionFallback(sectionTitle)
    || generic;
  return {
    kind: rule.kind,
    pattern: rule.pattern,
    hints: rule.hints,
    approach: rule.approach,
    checks: rule.checks,
    labels: rule.approach.labels || BUILD.labels,
  };
}
