const Entry = require('../../../src/models/entry');

describe('Entry Model', () => {
  describe('Entry Creation', () => {
    test('should create a valid entry', async () => {
      const entryData = {
        hungarian: 'fonéma',
        english: 'phoneme',
        fieldOfExpertise: 'phonology',
        wordType: 'noun',
      };

      const entry = new Entry(entryData);
      const savedEntry = await entry.save();

      expect(savedEntry._id).toBeDefined();
      expect(savedEntry.hungarian).toBe(entryData.hungarian);
      expect(savedEntry.english).toBe(entryData.english);
      expect(savedEntry.fieldOfExpertise).toBe(entryData.fieldOfExpertise);
      expect(savedEntry.wordType).toBe(entryData.wordType);
      expect(savedEntry.isActive).toBe(true);
      expect(savedEntry.views).toBe(0);
      expect(savedEntry.createdAt).toBeDefined();
      expect(savedEntry.updatedAt).toBeDefined();
    });

    test('should fail to create entry without required fields', async () => {
      const entry = new Entry({});

      await expect(entry.save()).rejects.toThrow();
    });

    test('should fail to create entry without hungarian field', async () => {
      const entry = new Entry({
        english: 'phoneme',
        fieldOfExpertise: 'phonology',
      });

      await expect(entry.save()).rejects.toThrow();
    });

    test('should fail to create entry without english field', async () => {
      const entry = new Entry({
        hungarian: 'fonéma',
        fieldOfExpertise: 'phonology',
      });

      await expect(entry.save()).rejects.toThrow();
    });

    test('should fail to create entry without fieldOfExpertise', async () => {
      const entry = new Entry({
        hungarian: 'fonéma',
        english: 'phoneme',
      });

      await expect(entry.save()).rejects.toThrow();
    });

    test('should trim whitespace from string fields', async () => {
      const entry = new Entry({
        hungarian: '  fonéma  ',
        english: '  phoneme  ',
        fieldOfExpertise: '  phonology  ',
        wordType: '  noun  ',
      });
      const savedEntry = await entry.save();

      expect(savedEntry.hungarian).toBe('fonéma');
      expect(savedEntry.english).toBe('phoneme');
      expect(savedEntry.fieldOfExpertise).toBe('phonology');
      expect(savedEntry.wordType).toBe('noun');
    });

    test('should enforce maxlength on hungarian field', async () => {
      const entry = new Entry({
        hungarian: 'a'.repeat(501),
        english: 'phoneme',
        fieldOfExpertise: 'phonology',
      });

      await expect(entry.save()).rejects.toThrow();
    });

    test('should default the bookkeeping fields', async () => {
      // `views` is writable on the model itself; the whitelist that keeps it out
      // of request bodies lives in the controller, which is covered by the
      // entries integration suite. Here we only pin the defaults.
      const entry = await createTestEntry();

      expect(entry.views).toBe(0);
      expect(entry.lastViewed).toBeNull();
    });
  });

  describe('Entry Instance Methods', () => {
    let entry;

    beforeEach(async () => {
      entry = await createTestEntry({
        hungarian: 'morfém',
        english: 'morpheme',
        fieldOfExpertise: 'morphology',
        wordType: 'noun',
      });
    });

    test('should increment views correctly', async () => {
      expect(entry.views).toBe(0);

      await entry.incrementViews();
      const updated = await Entry.findById(entry._id);

      expect(updated.views).toBe(1);
      expect(updated.lastViewed).toBeDefined();
    });

    test('should calculate word count virtual correctly', async () => {
      const complexEntry = await createTestEntry({
        hungarian: 'Az első magyar szó',
        english: 'The first Hungarian word',
        fieldOfExpertise: 'linguistics',
      });

      expect(complexEntry.wordCount.hungarian).toBe(4);
      expect(complexEntry.wordCount.english).toBe(4);
    });

    test('should count zero words for an unset side', () => {
      const bare = new Entry({});

      expect(bare.wordCount).toEqual({ hungarian: 0, english: 0 });
    });
  });

  describe('searchEntries projection', () => {
    // Replaces the old `toSearchResult()` coverage: that method is gone, and the
    // list projection is now what keeps bookkeeping fields out of responses.
    test('should expose only the public list projection', async () => {
      const author = await createTestUser({ email: 'author@example.com' });
      await createTestEntry({
        hungarian: 'morfém',
        english: 'morpheme',
        fieldOfExpertise: 'morphology',
        wordType: 'noun',
        createdBy: author._id,
        updatedBy: author._id,
      });

      const { query } = Entry.searchEntries('morfém');
      const [result] = await query;

      expect(result.hungarian).toBe('morfém');
      expect(result.english).toBe('morpheme');
      expect(result.fieldOfExpertise).toBe('morphology');
      expect(result.wordType).toBe('noun');
      expect(result.views).toBe(0);
      expect(result.createdAt).toBeDefined();

      expect(result.createdBy).toBeUndefined();
      expect(result.updatedBy).toBeUndefined();
      expect(result.isActive).toBeUndefined();
      expect(result.lastViewed).toBeUndefined();
    });
  });

  describe('searchEntries regex safety', () => {
    beforeEach(async () => {
      await createTestEntry({ hungarian: 'alma', english: 'apple', fieldOfExpertise: 'general' });
      await createTestEntry({
        hungarian: 'zalma',
        english: 'not an apple',
        fieldOfExpertise: 'general',
      });
      await createTestEntry({
        hungarian: 'a(zárójel',
        english: 'a(parenthesis',
        fieldOfExpertise: 'general',
      });
    });

    test('should not throw on an unbalanced regex metacharacter', async () => {
      expect(() => Entry.searchEntries('a(')).not.toThrow();

      const { query, countQuery } = Entry.searchEntries('a(');
      const [results, count] = await Promise.all([query, countQuery]);

      // Escaped, so it matches the literal "a(" prefix rather than blowing up.
      expect(count).toBe(1);
      expect(results[0].hungarian).toBe('a(zárójel');
    });

    test('should treat a catastrophic-backtracking payload as a literal', async () => {
      expect(() => Entry.searchEntries('(a+)+$')).not.toThrow();

      const { countQuery } = Entry.searchEntries('(a+)+$');

      await expect(countQuery).resolves.toBe(0);
    });

    test('should escape every regex metacharacter in a column filter', () => {
      const { query } = Entry.searchEntries('', { hungarian: '.*+?^${}()|[]\\' });
      const filter = query.getFilter();

      expect(filter.hungarian).toBeInstanceOf(RegExp);
      expect(filter.hungarian.source).toBe('^\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
    });

    test('should anchor the pattern at the start of the term', async () => {
      const { query } = Entry.searchEntries('alma');
      const filter = query.getFilter();

      expect(filter.$or[0].hungarian.source.startsWith('^')).toBe(true);

      const results = await query;

      // "zalma" contains "alma" but does not start with it, so an anchored
      // pattern must exclude it.
      expect(results).toHaveLength(1);
      expect(results[0].hungarian).toBe('alma');
    });

    test('should search both language columns', async () => {
      const { query } = Entry.searchEntries('apple');
      const filter = query.getFilter();

      expect(filter.$or).toHaveLength(2);
      expect(filter.$or[0]).toHaveProperty('hungarian');
      expect(filter.$or[1]).toHaveProperty('english');

      const results = await query;

      expect(results).toHaveLength(1);
      expect(results[0].english).toBe('apple');
    });

    test('should be case insensitive', async () => {
      const { countQuery } = Entry.searchEntries('ALMA');

      await expect(countQuery).resolves.toBe(1);
    });

    test('should ignore a blank or non-string search term', () => {
      expect(Entry.searchEntries('   ').query.getFilter()).toEqual({ isActive: true });
      expect(Entry.searchEntries(undefined).query.getFilter()).toEqual({ isActive: true });
      expect(Entry.searchEntries(42).query.getFilter()).toEqual({ isActive: true });
    });
  });

  describe('Entry Static Methods', () => {
    beforeEach(async () => {
      await createTestEntry({
        hungarian: 'fonéma',
        english: 'phoneme',
        fieldOfExpertise: 'phonology',
        wordType: 'noun',
        views: 100,
      });

      await createTestEntry({
        hungarian: 'morfém',
        english: 'morpheme',
        fieldOfExpertise: 'morphology',
        wordType: 'noun',
        views: 50,
      });

      await createTestEntry({
        hungarian: 'szintaxis',
        english: 'syntax',
        fieldOfExpertise: 'syntax',
        wordType: 'noun',
        views: 25,
      });

      await createTestEntry({
        hungarian: 'inaktív szó',
        english: 'inactive word',
        fieldOfExpertise: 'general',
        isActive: false,
      });
    });

    test('should search entries by prefix in either language', async () => {
      const { query, countQuery } = Entry.searchEntries('phoneme');
      const [results, count] = await Promise.all([query, countQuery]);

      expect(count).toBe(1);
      expect(results).toHaveLength(1);
      expect(results[0].hungarian).toBe('fonéma');
    });

    test('should filter entries by fieldOfExpertise', async () => {
      const { query, countQuery } = Entry.searchEntries('', { fieldOfExpertise: 'phonology' });
      const results = await query;
      const count = await countQuery;

      expect(results.length).toBe(1);
      expect(count).toBe(1);
      expect(results[0].fieldOfExpertise).toBe('phonology');
    });

    test('should filter entries by wordType', async () => {
      const { query, countQuery } = Entry.searchEntries('', { wordType: 'noun' });
      const results = await query;
      const count = await countQuery;

      expect(results.length).toBe(3);
      expect(count).toBe(3);
    });

    test('should let column filters win over the free-text term', async () => {
      const { query } = Entry.searchEntries('szintaxis', { fieldOfExpertise: 'phonology' });
      const filter = query.getFilter();

      expect(filter.$or).toBeUndefined();
      expect(filter.fieldOfExpertise).toBeInstanceOf(RegExp);

      const results = await query;

      expect(results).toHaveLength(1);
      expect(results[0].fieldOfExpertise).toBe('phonology');
    });

    test('should not include inactive entries in search', async () => {
      const { query, countQuery } = Entry.searchEntries('', {});
      const results = await query;
      const count = await countQuery;

      expect(results.every((e) => e.isActive !== false)).toBe(true);
      expect(count).toBe(3);
    });

    test('should paginate results correctly', async () => {
      const { query: page1Query } = Entry.searchEntries('', { page: 1, limit: 2 });
      const { query: page2Query } = Entry.searchEntries('', { page: 2, limit: 2 });

      const page1Results = await page1Query;
      const page2Results = await page2Query;

      expect(page1Results.length).toBe(2);
      expect(page2Results.length).toBe(1);
    });

    test('should clamp an out-of-range page size', async () => {
      const { query: oversized } = Entry.searchEntries('', { limit: 5000 });
      const { query: negative } = Entry.searchEntries('', { limit: -10, page: -3 });
      const { query: garbage } = Entry.searchEntries('', { limit: 'lots', page: 'first' });

      expect(oversized.getOptions().limit).toBe(100);
      expect(negative.getOptions().limit).toBe(1);
      expect(negative.getOptions().skip).toBe(0);
      expect(garbage.getOptions().limit).toBe(20);
      expect(garbage.getOptions().skip).toBe(0);
    });

    test('should sort by popularity', async () => {
      const { query } = Entry.searchEntries('', { sortBy: 'popular' });
      const results = await query;

      expect(results[0].views).toBeGreaterThanOrEqual(results[1].views);
    });

    test('should sort alphabetically', async () => {
      const { query } = Entry.searchEntries('', { sortBy: 'alphabetical' });
      const results = await query;

      expect(results[0].hungarian.localeCompare(results[1].hungarian)).toBeLessThanOrEqual(0);
    });

    test('should fall back to the default sort for an unknown sortBy', async () => {
      const { query } = Entry.searchEntries('', { sortBy: 'nonsense' });

      expect(query.getOptions().sort).toEqual({ hungarian: 1 });

      const results = await query;

      expect(results).toHaveLength(3);
    });

    test('should sort by newest and oldest', async () => {
      const newest = await Entry.searchEntries('', { sortBy: 'newest' }).query;
      const oldest = await Entry.searchEntries('', { sortBy: 'oldest' }).query;

      expect(new Date(newest[0].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(newest[2].createdAt).getTime()
      );
      expect(new Date(oldest[0].createdAt).getTime()).toBeLessThanOrEqual(
        new Date(oldest[2].createdAt).getTime()
      );
    });

    test('should get popular entries', async () => {
      const popular = await Entry.getPopularEntries(2);

      expect(popular.length).toBe(2);
      expect(popular[0].views).toBe(100);
      expect(popular[1].views).toBe(50);
    });

    test('should get recent entries', async () => {
      const recent = await Entry.getRecentEntries(2);

      expect(recent.length).toBe(2);

      expect(new Date(recent[0].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(recent[1].createdAt).getTime()
      );
    });

    test('should get correct statistics', async () => {
      const stats = await Entry.getStatistics();

      expect(stats.totalEntries).toBe(3);
      expect(stats.totalFields).toBe(3);
      expect(stats.totalViews).toBe(175);
      expect(stats.fields).toContain('phonology');
      expect(stats.fields).toContain('morphology');
      expect(stats.fields).toContain('syntax');
    });

    test('should exclude the empty word type from the statistics list', async () => {
      await createTestEntry({
        hungarian: 'nincs szófaj',
        english: 'no word type',
        fieldOfExpertise: 'general',
        wordType: '',
      });

      const stats = await Entry.getStatistics();

      expect(stats.wordTypes).toEqual(['noun']);
      expect(stats.totalWordTypes).toBe(1);
    });
  });

  describe('Entry Indexes', () => {
    // tests/setup.js runs syncIndexes() once the in-memory server is up, so the
    // declared indexes really exist and can be introspected.
    test('should have exactly one weighted text index covering both languages', async () => {
      const indexes = await Entry.collection.indexes();
      const textIndexes = indexes.filter((index) => index.key && index.key._fts === 'text');

      expect(textIndexes).toHaveLength(1);
      expect(textIndexes[0].name).toBe('entry_text_search');
      expect(textIndexes[0].weights).toEqual({ hungarian: 10, english: 5 });
    });

    test('should have a compound index supporting field and word type filters', async () => {
      const indexes = await Entry.collection.indexes();
      const compound = indexes.find(
        (index) => index.key.fieldOfExpertise !== undefined && index.key.wordType !== undefined
      );

      expect(compound).toBeDefined();
      expect(compound.key.isActive).toBe(1);
    });

    test('should have an index on views for the popular listing', async () => {
      const indexes = await Entry.collection.indexes();
      const viewsIndex = indexes.find((index) => index.key.views !== undefined);

      expect(viewsIndex).toBeDefined();
      expect(viewsIndex.key.views).toBe(-1);
    });
  });

  describe('Entry Validation Edge Cases', () => {
    test('should handle unicode characters correctly', async () => {
      const entry = new Entry({
        hungarian: 'áéíóöőúüű ÁÉÍÓÖŐÚÜŰ',
        english: 'Hungarian vowels',
        fieldOfExpertise: 'linguistics',
      });
      const saved = await entry.save();

      expect(saved.hungarian).toBe('áéíóöőúüű ÁÉÍÓÖŐÚÜŰ');
    });

    test('should handle special characters in fields', async () => {
      const entry = new Entry({
        hungarian: 'szó-összetétel (példa)',
        english: 'compound word (example)',
        fieldOfExpertise: 'word-formation',
      });
      const saved = await entry.save();

      expect(saved.hungarian).toBe('szó-összetétel (példa)');
    });

    test('should default wordType to an empty string when omitted', async () => {
      const entry = new Entry({
        hungarian: 'teszt',
        english: 'test',
        fieldOfExpertise: 'general',
      });
      const saved = await entry.save();

      expect(saved._id).toBeDefined();
      // Defaults to '' rather than undefined so `distinct('wordType')` returns a
      // homogeneous list of strings.
      expect(saved.wordType).toBe('');
    });

    test('should reject a negative view count', async () => {
      const entry = new Entry({
        hungarian: 'teszt',
        english: 'test',
        fieldOfExpertise: 'general',
        views: -1,
      });

      await expect(entry.save()).rejects.toThrow();
    });
  });
});
