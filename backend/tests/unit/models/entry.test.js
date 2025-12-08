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

    test('should return proper search result format', () => {
      const searchResult = entry.toSearchResult();
      
      expect(searchResult._id).toBe(entry._id);
      expect(searchResult.hungarian).toBe('morfém');
      expect(searchResult.english).toBe('morpheme');
      expect(searchResult.fieldOfExpertise).toBe('morphology');
      expect(searchResult.wordType).toBe('noun');
      expect(searchResult.views).toBeDefined();
      expect(searchResult.createdAt).toBeDefined();
      expect(searchResult.password).toBeUndefined();
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

    test('should search entries with text search', async () => {
      const { query, countQuery } = Entry.searchEntries('phoneme');
      const results = await query;
      const count = await countQuery;

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(count).toBeGreaterThanOrEqual(1);
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

    test('should not include inactive entries in search', async () => {
      const { query, countQuery } = Entry.searchEntries('', {});
      const results = await query;
      const count = await countQuery;

      expect(results.every(e => e.isActive !== false)).toBe(true);
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

    test('should get popular entries', async () => {
      const popular = await Entry.getPopularEntries(2);

      expect(popular.length).toBe(2);
      expect(popular[0].views).toBe(100);
      expect(popular[1].views).toBe(50);
    });

    test('should get recent entries', async () => {
      const recent = await Entry.getRecentEntries(2);

      expect(recent.length).toBe(2);
      
      expect(new Date(recent[0].createdAt).getTime())
        .toBeGreaterThanOrEqual(new Date(recent[1].createdAt).getTime());
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
  });

  describe('Entry Indexes', () => {
    test('should have text index for search', async () => {
      const indexes = await Entry.collection.getIndexes();
      const searchIndex = Object.entries(indexes).find(([name, index]) => 
        name === 'search_index' || 
        (index.key && (index.key._fts === 'text'))
      );
      
      expect(searchIndex).toBeDefined();
    });

    test('should have index on fieldOfExpertise', async () => {
      const indexes = await Entry.collection.getIndexes();
      const fieldIndex = Object.values(indexes).find(index => 
        index.key && index.key.fieldOfExpertise !== undefined
      );
      
      expect(fieldIndex).toBeDefined();
    });

    test('should have index on views for popular queries', async () => {
      const indexes = await Entry.collection.getIndexes();
      const viewsIndex = Object.values(indexes).find(index => 
        index.key && index.key.views !== undefined
      );
      
      expect(viewsIndex).toBeDefined();
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

    test('should allow wordType to be optional', async () => {
      const entry = new Entry({
        hungarian: 'teszt',
        english: 'test',
        fieldOfExpertise: 'general',
        
      });
      const saved = await entry.save();

      expect(saved._id).toBeDefined();
      expect(saved.wordType).toBeUndefined();
    });
  });
});
