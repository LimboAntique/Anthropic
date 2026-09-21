// Multiple-choice question; options[0] is always the correct answer and draw() shuffles the order
export interface Question {
  q: string
  options: [string, string, string, string]
  why: string
}

export interface Drawn {
  q: string
  options: string[]
  answer: number // index of the correct option after shuffling
  why: string
}

const Q = (q: string, right: string, a: string, b: string, c: string, why: string): Question => ({ q, options: [right, a, b, c], why })

export const BANK: Question[] = [
  // Popularity, memory and hit rate
  Q('With no TTL and no writes, which pair of inputs determines the hit rate of an LRU cache under Zipf traffic?', 'The skew α and the fraction of keys that fit in memory', 'Reads per second and the fraction of keys that fit', 'Reads per second and the skew α', 'Redis latency and database latency', 'Che\'s eviction age scales as 1/traffic, so traffic cancels out of λ·Tc. Only skew and the cached fraction remain.'),
  Q('Traffic grows tenfold. There is no TTL and there are no writes. What happens to the hit rate?', 'It stays the same', 'It rises, because hot keys are re-read sooner', 'It falls, because the cache churns faster', 'It rises tenfold until it saturates', 'Every key is read ten times as often, and keys are evicted ten times as fast. The two effects cancel exactly.'),
  Q('Every key is equally popular (α = 0), the cache holds 10% of the keys and there is no TTL. What is the hit rate?', 'About 10%', 'About 50%', 'About 90%', 'It depends on reads per second', 'With uniform access the cache is a random 10% sample of the keys, so one read in ten finds its key.'),
  Q('The same cache serves two workloads, one with α = 0.6 and one with α = 1.4. Which has the higher hit rate?', 'α = 1.4, because more of the traffic goes to the few keys that fit', 'α = 0.6, because load is spread more evenly', 'They are equal; α only affects latency', 'α = 0.6, because fewer keys are evicted', 'Higher skew concentrates traffic on the hottest keys, which are exactly the ones an LRU cache retains.'),
  Q('On the miss-rate-versus-memory chart, what is the dashed "ideal" line?', 'A cache that always holds exactly the hottest keys', 'A cache with unlimited memory', 'A cache with zero network latency', 'The same cache with LFU eviction measured in production', 'It is the lower bound for any policy under stationary traffic: fill memory with the most popular keys and never evict them.'),
  Q('Why does LRU miss more often than the ideal line at the same memory size?', 'It spends slots on cold keys that happen to have been read recently', 'It evicts the hottest keys first', 'It cannot store keys that have a TTL', 'It needs twice the memory per key', 'LRU only knows recency. A cold key that was just read occupies a slot until it ages out, displacing a warmer one.'),
  Q('You are well past the knee of the miss-rate curve. What does doubling memory buy?', 'Very little: the remaining misses come from a long tail of rarely read keys', 'It halves the miss rate', 'It removes misses entirely', 'It lowers P99 to Redis latency', 'Under Zipf each extra gigabyte holds ever colder keys, so the marginal hit rate per dollar keeps falling.'),
  Q('Twitter analysed 153 production cache clusters. What range of Zipf α did most of them show?', 'Roughly 1 to 2.5', 'Roughly 0 to 0.3', 'Exactly 1 in every cluster', 'Above 5', 'Production key-value caches are highly skewed; read-heavy clusters had a median α near 1.4.'),
  Q('How many keys fit in a Redis instance?', 'Memory divided by (object size + per-key overhead)', 'Memory divided by object size', 'Memory divided by key length', 'Memory times the hit rate', 'Redis spends on the order of 100 bytes per key on its dictionary entry, object header and expiry record, which matters for small values.'),
  Q('Che\'s approximation says an LRU cache of fixed size behaves like what?', 'A TTL cache whose timer restarts on every read and equals the eviction age Tc', 'A FIFO queue of the same length', 'A cache with a random eviction policy', 'A TTL cache whose timer never restarts', 'A key leaves an LRU cache once it has gone unread for about Tc. That is a read-refreshed TTL, which puts memory and TTL in the same unit: seconds.'),

  // TTL and eviction age
  Q('What is the eviction age Tc?', 'How long a key can go unread before memory pressure evicts it', 'The TTL configured on the key', 'The time Redis takes to delete a key', 'The average time between writes', 'Tc falls out of the memory size and the traffic: it is the age of the key at the cold end of the LRU list.'),
  Q('TTL is 1 hour and the eviction age is 6 minutes. A key is read about once an hour. What removes it?', 'Eviction, about 6 minutes after the read', 'The TTL, after 1 hour', 'Neither; it stays forever', 'The next write', 'A cold key goes unread for longer than Tc long before its TTL, so for cold keys the TTL never fires.'),
  Q('Same cache (TTL 1 hour, eviction age 6 minutes). A key is read every second. What removes it?', 'The TTL, one hour after it was inserted', 'Eviction, after 6 minutes', 'Eviction, after 1 second', 'Nothing; hot keys are never removed', 'A hot key is never idle for Tc, so eviction cannot touch it. Its only exit is the TTL, which Redis does not refresh on reads.'),
  Q('TTL is 5 seconds and only 0.01 GB of an 8 GB instance is ever used. What lowers the bill without changing the hit rate?', 'A much smaller instance', 'A shorter TTL', 'Switching to invalidate on write', 'More replicas', 'The TTL is the binding limit: keys expire before memory fills. Memory beyond what the TTL keeps alive is never touched.'),
  Q('Does reading a key with GET restart its TTL in Redis?', 'No, the TTL counts from when the key was written', 'Yes, every read restarts it', 'Only for keys larger than 1 KB', 'Only under the allkeys-lru policy', 'EXPIRE is set by the writer. This is why a fixed TTL and LRU recency are modelled as two different clocks.'),
  Q('Eviction age is 6 minutes. You raise the TTL from 1 hour to 24 hours. What happens to the miss rate?', 'It barely moves', 'It falls by a factor of 24', 'It rises sharply', 'It drops to zero', 'Most keys are already removed by eviction long before either TTL. Only the hottest keys notice, and they were nearly always hits anyway.'),
  Q('What does the tool report when the TTL is far shorter than the eviction age would be?', 'Memory never fills, the eviction age is infinite and the TTL is the binding limit', 'Memory overflows and Redis crashes', 'The TTL is ignored', 'The hit rate becomes independent of the TTL', 'Keys expire faster than traffic inserts them, so no key is ever evicted for lack of space.'),
  Q('A key is read at rate λ, has a fixed TTL T and is never evicted. What is its hit probability?', 'λT / (1 + λT)', '1 − e^(−λT)', 'λT', '1 / (λT)', 'Each cycle is one miss that inserts the key, then λT expected hits during its lifetime: λT hits out of λT + 1 reads.'),
  Q('A key is read on average once per TTL period (λT = 1) and is never evicted. How often is it a hit?', '50%', '63%', '100%', '10%', 'λT / (1 + λT) = 1/2. A TTL equal to the mean time between reads wastes half the reads.'),
  Q('The TTL is the binding limit and you add memory. What happens to the hit rate?', 'Nothing', 'It rises in proportion to memory', 'It falls', 'It rises until the TTL doubles', 'The new memory stays empty. Only a longer TTL, or more traffic per key, would keep more keys alive.'),

  // Latency
  Q('What does a cache miss cost compared with having no cache at all?', 'More: the Redis round trip plus the database read', 'The same', 'Less, because the connection is already warm', 'Nothing; misses are free', 'Every miss pays for both systems. A cache with a low hit rate is a net slowdown.'),
  Q('The miss rate is 20%. Which database percentile does the cached P99 correspond to?', 'Roughly the database P95, plus a Redis round trip', 'The database P99', 'The database P50', 'The Redis P99', 'The slowest 1% of all requests are the slowest 5% of the misses: 1 − 0.01/0.20 = 0.95.'),
  Q('What has to be true before P99 is served from Redis instead of the database?', 'The miss rate (plus Redis downtime) must be under 1%', 'The hit rate must exceed 50%', 'Redis P99 must be below database P50', 'The TTL must be infinite', 'As long as more than 1% of requests reach the database, the slowest 1% are all database reads.'),
  Q('The hit rate is 60%. What is the median (P50) request?', 'A Redis hit', 'A database read', 'A timeout', 'Half of each', 'More than half of all requests are hits, so the median falls inside the hit population.'),
  Q('The hit rate is 40%. How does P50 compare with having no cache?', 'Slightly worse: the median request is a miss that paid for Redis first', 'About ten times better', 'Exactly the same', 'Equal to Redis P50', 'The median is now a miss, and a miss costs the database read plus the Redis round trip.'),
  Q('The hit rate is 90%. Which percentile improves least?', 'P99', 'P50', 'P75', 'They all improve equally', 'P50 and P75 become Redis hits. P99 is still a miss, merely a less extreme one.'),
  Q('Redis is available 98% of the time and clients time out after 100 ms. What happens to P99?', 'It now includes the timeout, because 2% of requests is more than the slowest 1%', 'Nothing; outages only affect P99.9', 'It improves, because fewer requests reach Redis', 'It equals Redis P99', 'Any failure mode that affects more than 1% of requests owns the P99.'),
  Q('Why does the client timeout setting matter in this model?', 'While Redis is down every request waits out the timeout before falling back to the database', 'It sets the TTL of cached keys', 'It limits how many keys fit in memory', 'It decides which keys are evicted', 'A generous timeout turns a cache outage into a latency outage for every single request.'),
  Q('Access is uniform and the hit rate is 9%. How does P99 compare with having no cache?', 'Slightly worse', 'About 9% better', 'Ten times better', 'Identical', 'Nearly every request is a miss and every miss pays the extra Redis round trip.'),
  Q('Mean latency dropped a lot after adding a cache but P99 hardly moved. Why?', 'The tail is made of misses, and misses are as slow as before', 'Redis has a slow P99', 'The mean is measured incorrectly', 'The database got slower', 'Caches speed up the requests that hit. The tail is where the requests that did not hit live.'),

  // Staleness and write policy
  Q('Under the "ttl-only" policy, what is a stale read?', 'A hit that returns a value already overwritten in the database', 'A read that misses the cache', 'A read that times out', 'A read of an expired key', 'Writes go to the database only. The cached copy keeps being served until its TTL fires.'),
  Q('A key is written at rate w and cached with TTL T, with w·T small. Roughly what fraction of its hits are stale?', 'w·T / 2', 'w·T', '1 / (w·T)', 'Zero', 'A hit at age t is stale with probability about w·t, and hits are spread evenly over the lifetime, so the average is w·T/2.'),
  Q('Writes follow the same popularity as reads. Which keys are stale most often?', 'The hottest keys', 'The coldest keys', 'Keys with the largest values', 'All keys equally', 'Staleness follows per-key write rate × TTL. The hottest keys are rewritten every few seconds but cached for the whole TTL.'),
  Q('One write per hundred reads, α = 1, TTL of one hour, writes as skewed as reads. About how many reads are stale?', 'More than half', 'About 1%', 'About 0.01%', 'None', 'The overall write ratio is tiny, but the hot keys that serve most reads are overwritten many times per TTL.'),
  Q('You switch from "ttl-only" to "invalidate on write". What changes?', 'Stale reads vanish and the miss rate rises', 'Stale reads and misses both fall', 'Nothing measurable', 'Stale reads rise and misses fall', 'Every write deletes the cached copy, so the next read must miss. Freshness is paid for in misses.'),
  Q('Under "invalidate on write", what happens to a key that is written more often than it is read?', 'It is almost never a hit: it is deleted before anyone reads it again', 'It becomes permanently cached', 'It is served stale', 'It is moved to the front of the LRU list', 'The key\'s cached lifetime is capped by the time to its next write. Write-hot keys thrash.'),
  Q('Under "ttl-only" you halve the TTL. What is the tradeoff?', 'Fewer stale reads, more misses', 'Fewer stale reads and fewer misses', 'More stale reads, fewer misses', 'No change to either', 'The TTL is the one knob that trades freshness against hit rate (and therefore database load).'),
  Q('Under "ttl-only", what bounds how out of date a cached value can be?', 'The TTL', 'The eviction age', 'The Redis timeout', 'The database P99', 'A value is refetched at the latest one TTL after it was cached, no matter how often it is read.'),
  Q('The data is never written. What does a finite TTL achieve?', 'Only extra misses; nothing can go stale', 'Fresher data', 'Lower P99', 'Higher availability', 'The TTL exists to bound staleness. With immutable data it has a cost and no benefit, apart from reclaiming memory.'),
  Q('Writes are 0.01% of traffic, yet the tool reports a high stale rate. What explains it?', 'Staleness depends on per-key write rate × TTL, and hot keys absorb most writes', 'The simulator is wrong below 1% writes', 'Redis drops writes under load', 'The database is overloaded', 'The global write ratio hides what matters: how many times a popular key is rewritten during one TTL.'),

  // Reliability, Redis configuration and cost
  Q('The database handles 5,000 qps. Traffic is 10,000 reads/s with an 80% hit rate. What happens when Redis goes down?', 'The database receives twice its capacity: a Redis outage is a full outage', 'Nothing; the database absorbs it', 'Latency rises by one Redis round trip', 'Only P99 is affected', 'With the cache the database sees about 2,000 qps. Without it, all 10,000 arrive at once.'),
  Q('What does it mean for a cache to be "load-bearing"?', 'The database could not serve the full traffic without it', 'It stores more than 1 TB', 'It has replicas', 'Its hit rate is above 99%', 'The cache has stopped being an optimisation and become a hard dependency for availability.'),
  Q('A load-bearing cache is wiped. Why might the system fail to recover on its own?', 'Every read misses, the overloaded database slows down, requests time out and the cache never refills', 'Redis refuses new keys for an hour', 'TTLs were lost in the restart', 'Clients cache DNS for too long', 'This is the metastable "sad loop": the empty-cache state sustains itself, and load tests rarely reveal it.'),
  Q('What is the default maxmemory-policy of open-source Redis?', 'noeviction', 'allkeys-lru', 'volatile-ttl', 'allkeys-lfu', 'Redis is a database first. Using it as a cache requires choosing an eviction policy explicitly.'),
  Q('Under noeviction, what happens once memory is full?', 'Commands that need memory fail with an error', 'The oldest keys are evicted', 'Redis restarts', 'Keys are written to disk', 'New keys cannot be cached, so the hit rate decays as existing keys expire, usually without anyone noticing.'),
  Q('How does Redis implement LRU eviction?', 'It samples a few keys (5 by default) and evicts the one idle longest', 'It keeps an exact linked list of every key', 'It evicts a random key', 'It evicts the largest key', 'Sampling avoids per-key list pointers. With a small pool of candidates it tracks true LRU closely.'),
  Q('How does Redis remove keys whose TTL has passed?', 'Lazily when the key is accessed, plus a background job that samples keys', 'Instantly, with a timer per key', 'Only when memory is full', 'Once a day', 'Expired keys can hold memory briefly. The model assumes instant expiry, which is slightly optimistic about capacity.'),
  Q('Halving memory from 4 GB to 2 GB raises the miss rate by 0.3 points. What is the sensible move?', 'Take the saving; you were past the knee', 'Double memory to 8 GB instead', 'Shorten the TTL', 'Add a second Redis in front', 'Half the bill for a third of a point of misses. The marginal gigabytes were holding keys almost nobody reads.'),
  Q('How does the database load shown by the tool respond to the miss rate?', 'Load = (reads × miss rate + writes) / capacity', 'Load = reads / capacity, independent of misses', 'Load = hit rate × capacity', 'Load = writes / reads', 'Only misses and writes reach the database. Lowering the miss rate from 20% to 10% halves the read load.'),
  Q('The model assumes stationary, independent requests. Real traffic has bursts and temporal locality. How does real LRU usually compare?', 'It tends to do better than the model predicts', 'It does far worse', 'It is identical by definition', 'It stops working entirely', 'Recently read keys are more likely to be read again soon, which is precisely what LRU bets on.'),
]

// Picks n distinct questions and shuffles their options (Fisher-Yates on index arrays)
export function draw(n = 5, rand: () => number = Math.random): Drawn[] {
  const shuffle = (k: number) => {
    const a = Array.from({ length: k }, (_, i) => i)
    for (let i = k - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  return shuffle(BANK.length).slice(0, n).map((i) => {
    const order = shuffle(4)
    return { q: BANK[i].q, options: order.map((o) => BANK[i].options[o]), answer: order.indexOf(0), why: BANK[i].why }
  })
}
