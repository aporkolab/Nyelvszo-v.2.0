const request = require('supertest');

const app = require('../../src/server');
const Entry = require('../../src/models/entry');
const { ROLES } = require('../../src/constants/roles');

const MISSING_ID = '507f1f77bcf86cd799439011';

const VALID_ENTRY = {
  hungarian: 'fonéma',
  english: 'phoneme',
  fieldOfExpertise: 'phonology',
  wordType: 'főnév',
};

describe('Entries API', () => {
  let admin;
  let editor;
  let viewer;

  /**
   * Register a beforeEach that provisions one account per role.
   *
   * Called only by the blocks that need a token: bcrypt runs at cost 12, so
   * three accounts is roughly a second per test and the public-read blocks
   * have no use for them.
   *
   * @returns {void}
   */
  const withActors = () => {
    beforeEach(async () => {
      admin = await createTestUser({ email: 'admin@example.com', role: ROLES.ADMIN });
      editor = await createTestUser({ email: 'editor@example.com', role: ROLES.EDITOR });
      viewer = await createTestUser({ email: 'viewer@example.com', role: ROLES.VIEWER });
    });
  };

  describe('Public reads', () => {
    beforeEach(async () => {
      await createTestEntry({ hungarian: 'alma', english: 'apple', fieldOfExpertise: 'botany' });
      await createTestEntry({
        hungarian: 'körte',
        english: 'pear',
        fieldOfExpertise: 'botany',
        views: 7,
      });
    });

    test('should list entries without a token', async () => {
      const response = await request(app).get('/entries').expect(200);

      expect(response.body.data).toHaveLength(2);
    });

    test('should return the full pagination envelope', async () => {
      const response = await request(app).get('/entries?page=1&limit=1').expect(200);

      expect(response.body).toEqual({
        data: expect.any(Array),
        pagination: {
          currentPage: 1,
          totalPages: 2,
          totalItems: 2,
          itemsPerPage: 1,
          hasNextPage: true,
          hasPrevPage: false,
        },
        meta: {
          searchTerm: null,
          filters: { fieldOfExpertise: null, wordType: null },
          sortBy: 'relevance',
        },
      });

      expect(response.headers['x-total-count']).toBe('2');
      expect(response.headers['x-page']).toBe('1');
      expect(response.headers['x-per-page']).toBe('1');
    });

    test('should report the search term and filters in meta', async () => {
      const response = await request(app)
        .get('/entries?search=alma&fieldOfExpertise=botany&sortBy=newest')
        .expect(200);

      expect(response.body.meta).toEqual({
        searchTerm: 'alma',
        filters: { fieldOfExpertise: 'botany', wordType: null },
        sortBy: 'newest',
      });
    });

    test('should include statistics only when asked', async () => {
      const without = await request(app).get('/entries').expect(200);
      expect(without.body).not.toHaveProperty('statistics');

      const with_ = await request(app).get('/entries?includeStats=true').expect(200);
      expect(with_.body.statistics).toMatchObject({ totalEntries: 2, totalFields: 1 });
    });

    test('should keep bookkeeping fields out of the listing', async () => {
      const response = await request(app).get('/entries').expect(200);

      response.body.data.forEach((entry) => {
        expect(entry).not.toHaveProperty('createdBy');
        expect(entry).not.toHaveProperty('updatedBy');
        expect(entry).not.toHaveProperty('isActive');
        expect(entry).not.toHaveProperty('lastViewed');
      });
    });

    test('should fetch a single entry without a token', async () => {
      const entry = await Entry.findOne({ hungarian: 'alma' });

      const response = await request(app).get(`/entries/${entry._id}`).expect(200);

      expect(response.body.data.hungarian).toBe('alma');
    });

    // The 200s below double as the "literal routes are declared before /:id"
    // check: "popular", "recent" and "statistics" are not valid ObjectIds, so a
    // 400 here would mean the parameterised route had matched first.
    test('should serve popular, recent and statistics without a token', async () => {
      const popular = await request(app).get('/entries/popular?limit=1').expect(200);
      expect(popular.body.data).toHaveLength(1);
      expect(popular.body.data[0].english).toBe('pear');
      expect(popular.body.meta).toEqual({ type: 'popular', limit: 1 });

      const recent = await request(app).get('/entries/recent').expect(200);
      expect(recent.body.data).toHaveLength(2);
      expect(recent.body.meta).toEqual({ type: 'recent', limit: 10 });

      const statistics = await request(app).get('/entries/statistics').expect(200);
      expect(statistics.body.data).toMatchObject({
        totalEntries: 2,
        totalFields: 1,
        totalViews: 7,
        averageViewsPerEntry: 3.5,
      });
    });

    test('should hide soft-deleted entries', async () => {
      const entry = await Entry.findOne({ hungarian: 'alma' });
      await Entry.updateOne({ _id: entry._id }, { $set: { isActive: false } });

      const list = await request(app).get('/entries').expect(200);
      expect(list.body.data).toHaveLength(1);

      await request(app).get(`/entries/${entry._id}`).expect(404);
    });

    test('should count a view on a single-entry read', async () => {
      const entry = await Entry.findOne({ hungarian: 'alma' });

      await request(app).get(`/entries/${entry._id}`).expect(200);

      // The increment is fire-and-forget, so poll briefly rather than assuming
      // it has landed by the time the response returns.
      let updated;
      for (let attempt = 0; attempt < 100 && (!updated || updated.views === 0); attempt += 1) {
        await new Promise((resolve) => {
          setTimeout(resolve, 25);
        });
        updated = await Entry.findById(entry._id);
      }

      expect(updated.views).toBe(1);
      expect(updated.lastViewed).not.toBeNull();
    });
  });

  describe('Query validation', () => {
    test('should reject a $ne operator smuggled through the query string', async () => {
      const smuggled = [
        '/entries?search[$ne]=',
        '/entries?hungarian[$ne]=',
        '/entries?english[$regex]=.*',
        '/entries?fieldOfExpertise[$gt]=',
        '/entries?wordType[$ne]=null',
      ];

      for (const url of smuggled) {
        const response = await request(app).get(url);

        expect(response.status).toBe(400);
        expect(response.body.type).toBe('ValidationError');
      }
    });

    test('should reject a page size above the cap', async () => {
      const response = await request(app).get('/entries?limit=100000').expect(400);

      expect(response.body.details[0].field).toBe('limit');
    });

    test('should clamp the effective page size at 100 even so', async () => {
      // Belt and braces: the schema rejects >100, and the model clamps whatever
      // reaches it. Neither alone should be load-bearing.
      const { query } = Entry.searchEntries('', { limit: 100000 });

      expect(query.getOptions().limit).toBe(100);
    });

    test('should reject a non-numeric page', async () => {
      await request(app).get('/entries?page=abc').expect(400);
    });

    test('should reject an unknown sort key', async () => {
      await request(app).get('/entries?sortBy=; drop everything').expect(400);
    });

    test('should strip unknown query parameters instead of forwarding them', async () => {
      await createTestEntry();

      const response = await request(app)
        .get('/entries?isActive=false&views=999&$where=1')
        .expect(200);

      expect(response.body.data).toHaveLength(1);
    });

    test('should apply defaults when the query is empty', async () => {
      const response = await request(app).get('/entries').expect(200);

      expect(response.body.pagination.currentPage).toBe(1);
      expect(response.body.pagination.itemsPerPage).toBe(20);
      expect(response.body.meta.sortBy).toBe('relevance');
    });

    test('should cap the popular/recent limit', async () => {
      await request(app).get('/entries/popular?limit=500').expect(400);
      await request(app).get('/entries/recent?limit=0').expect(400);
    });

    test('should answer 400, not 500, for a malformed entry id', async () => {
      const response = await request(app).get('/entries/not-an-object-id').expect(400);

      expect(response.body.statusCode).toBe(400);
      expect(response.body.type).toBe('ValidationError');
      expect(response.body.details[0].field).toBe('id');
    });

    test('should answer 404 for a well-formed but unknown id', async () => {
      const response = await request(app).get(`/entries/${MISSING_ID}`).expect(404);

      expect(response.body.type).toBe('NotFoundError');
    });
  });

  describe('POST /entries', () => {
    withActors();

    test('should reject an anonymous create', async () => {
      const response = await request(app).post('/entries').send(VALID_ENTRY).expect(401);

      expect(response.body.error).toContain('Access token is required');
      await expect(Entry.countDocuments()).resolves.toBe(0);
    });

    test('should reject a viewer (role 1)', async () => {
      const response = await request(app)
        .post('/entries')
        .set('Authorization', authHeader(viewer))
        .send(VALID_ENTRY)
        .expect(403);

      expect(response.body.error).toContain('Insufficient permissions');
      await expect(Entry.countDocuments()).resolves.toBe(0);
    });

    test('should accept an editor (role 2)', async () => {
      const response = await request(app)
        .post('/entries')
        .set('Authorization', authHeader(editor))
        .send(VALID_ENTRY)
        .expect(201);

      expect(response.body.data).toMatchObject(VALID_ENTRY);
      expect(response.body.meta.message).toBe('Entry created successfully');
    });

    test('should accept an admin (role 3)', async () => {
      await request(app)
        .post('/entries')
        .set('Authorization', authHeader(admin))
        .send(VALID_ENTRY)
        .expect(201);
    });

    test('should stamp the author from the token, not the body', async () => {
      await request(app)
        .post('/entries')
        .set('Authorization', authHeader(editor))
        .send({ ...VALID_ENTRY, createdBy: admin._id.toString() })
        .expect(201);

      const stored = await Entry.findOne({ hungarian: 'fonéma' });

      expect(stored.createdBy.toString()).toBe(editor._id.toString());
      expect(stored.updatedBy.toString()).toBe(editor._id.toString());
    });

    test('should strip server-owned fields from the body', async () => {
      await request(app)
        .post('/entries')
        .set('Authorization', authHeader(editor))
        .send({ ...VALID_ENTRY, views: 9999, isActive: false, _id: MISSING_ID })
        .expect(201);

      const stored = await Entry.findOne({ hungarian: 'fonéma' });

      expect(stored.views).toBe(0);
      expect(stored.isActive).toBe(true);
      expect(stored._id.toString()).not.toBe(MISSING_ID);
    });

    test('should reject a body missing required fields', async () => {
      const response = await request(app)
        .post('/entries')
        .set('Authorization', authHeader(editor))
        .send({ hungarian: 'fonéma' })
        .expect(400);

      expect(response.body.details.map((d) => d.field)).toEqual(
        expect.arrayContaining(['english', 'fieldOfExpertise'])
      );
    });

    test('should reject an over-long term', async () => {
      await request(app)
        .post('/entries')
        .set('Authorization', authHeader(editor))
        .send({ ...VALID_ENTRY, hungarian: 'a'.repeat(501) })
        .expect(400);
    });

    test('should reject an object in place of a term', async () => {
      await request(app)
        .post('/entries')
        .set('Authorization', authHeader(editor))
        .send({ ...VALID_ENTRY, hungarian: { $ne: null } })
        .expect(400);
    });

    test('should accept an empty word type', async () => {
      const response = await request(app)
        .post('/entries')
        .set('Authorization', authHeader(editor))
        .send({ ...VALID_ENTRY, wordType: '' })
        .expect(201);

      expect(response.body.data.wordType).toBe('');
    });
  });

  describe('PUT and PATCH /entries/:id', () => {
    withActors();

    let entry;

    beforeEach(async () => {
      entry = await createTestEntry();
    });

    test('should reject an anonymous update', async () => {
      await request(app).patch(`/entries/${entry._id}`).send({ english: 'hacked' }).expect(401);
      await request(app).put(`/entries/${entry._id}`).send({ english: 'hacked' }).expect(401);

      const untouched = await Entry.findById(entry._id);
      expect(untouched.english).toBe('test word');
    });

    test('should reject a viewer', async () => {
      await request(app)
        .patch(`/entries/${entry._id}`)
        .set('Authorization', authHeader(viewer))
        .send({ english: 'hacked' })
        .expect(403);

      const untouched = await Entry.findById(entry._id);
      expect(untouched.english).toBe('test word');
    });

    test('should let an editor update', async () => {
      const response = await request(app)
        .patch(`/entries/${entry._id}`)
        .set('Authorization', authHeader(editor))
        .send({ english: 'revised word' })
        .expect(200);

      expect(response.body.data.english).toBe('revised word');
      expect(response.body.meta.message).toBe('Entry updated successfully');

      const stored = await Entry.findById(entry._id);
      expect(stored.updatedBy.toString()).toBe(editor._id.toString());
    });

    test('should let an admin update', async () => {
      await request(app)
        .put(`/entries/${entry._id}`)
        .set('Authorization', authHeader(admin))
        .send({ english: 'admin revised' })
        .expect(200);
    });

    test('should ignore server-owned fields in an update', async () => {
      await request(app)
        .patch(`/entries/${entry._id}`)
        .set('Authorization', authHeader(editor))
        .send({ english: 'revised', views: 5000, isActive: false })
        .expect(200);

      const stored = await Entry.findById(entry._id);

      expect(stored.views).toBe(0);
      expect(stored.isActive).toBe(true);
    });

    test('should reject an empty update body', async () => {
      await request(app)
        .patch(`/entries/${entry._id}`)
        .set('Authorization', authHeader(editor))
        .send({})
        .expect(400);
    });

    test('should answer 404 for a missing entry', async () => {
      await request(app)
        .patch(`/entries/${MISSING_ID}`)
        .set('Authorization', authHeader(editor))
        .send({ english: 'ghost' })
        .expect(404);
    });

    test('should answer 400 for a malformed id', async () => {
      await request(app)
        .patch('/entries/nope')
        .set('Authorization', authHeader(editor))
        .send({ english: 'ghost' })
        .expect(400);
    });

    test('should refuse to update a soft-deleted entry', async () => {
      await Entry.updateOne({ _id: entry._id }, { $set: { isActive: false } });

      await request(app)
        .patch(`/entries/${entry._id}`)
        .set('Authorization', authHeader(editor))
        .send({ english: 'resurrected' })
        .expect(404);
    });
  });

  describe('DELETE /entries/:id', () => {
    withActors();

    let entry;

    beforeEach(async () => {
      entry = await createTestEntry();
    });

    test('should reject an anonymous delete', async () => {
      await request(app).delete(`/entries/${entry._id}`).expect(401);

      const stored = await Entry.findById(entry._id);
      expect(stored.isActive).toBe(true);
    });

    test('should reject a viewer', async () => {
      await request(app)
        .delete(`/entries/${entry._id}`)
        .set('Authorization', authHeader(viewer))
        .expect(403);

      const stored = await Entry.findById(entry._id);
      expect(stored.isActive).toBe(true);
    });

    test('should soft-delete for an editor', async () => {
      const response = await request(app)
        .delete(`/entries/${entry._id}`)
        .set('Authorization', authHeader(editor))
        .expect(200);

      expect(response.body.meta).toEqual({
        message: 'Entry deleted successfully',
        entryId: entry._id.toString(),
      });

      // Soft delete: the row survives, the listing does not show it.
      const stored = await Entry.findById(entry._id);
      expect(stored).not.toBeNull();
      expect(stored.isActive).toBe(false);
      expect(stored.updatedBy.toString()).toBe(editor._id.toString());

      const list = await request(app).get('/entries').expect(200);
      expect(list.body.data).toHaveLength(0);
    });

    test('should answer 404 when deleting twice', async () => {
      await request(app)
        .delete(`/entries/${entry._id}`)
        .set('Authorization', authHeader(editor))
        .expect(200);

      await request(app)
        .delete(`/entries/${entry._id}`)
        .set('Authorization', authHeader(editor))
        .expect(404);
    });

    test('should answer 400 for a malformed id', async () => {
      await request(app)
        .delete('/entries/nope')
        .set('Authorization', authHeader(editor))
        .expect(400);
    });
  });

  describe('POST /entries/bulk', () => {
    withActors();

    let first;
    let second;

    beforeEach(async () => {
      first = await createTestEntry({
        hungarian: 'alma',
        english: 'apple',
        fieldOfExpertise: 'botany',
        wordType: 'főnév',
      });
      second = await createTestEntry({
        hungarian: 'körte',
        english: 'pear',
        fieldOfExpertise: 'botany',
        wordType: 'főnév',
      });
    });

    test('should reject an anonymous caller', async () => {
      await request(app)
        .post('/entries/bulk')
        .send({ operation: 'delete', entries: [first._id.toString()] })
        .expect(401);
    });

    test('should reject a viewer', async () => {
      await request(app)
        .post('/entries/bulk')
        .set('Authorization', authHeader(viewer))
        .send({ operation: 'delete', entries: [first._id.toString()] })
        .expect(403);
    });

    test('should reject an editor — bulk is admin-only', async () => {
      const response = await request(app)
        .post('/entries/bulk')
        .set('Authorization', authHeader(editor))
        .send({ operation: 'delete', entries: [first._id.toString()] })
        .expect(403);

      expect(response.body.error).toContain('Insufficient permissions');

      const stored = await Entry.findById(first._id);
      expect(stored.isActive).toBe(true);
    });

    // The `_id: { $in: … }` selector these two tests exercise only works because
    // the controller wraps it in `mongoose.trusted()`: `sanitizeFilter` is on
    // globally and would otherwise rewrite the server-built `$in` into
    // `{ $eq: { $in: [...] } }`, which fails to cast and turns every
    // bulk-by-id request into a 400.
    test('should let an admin bulk-delete by id', async () => {
      const untouched = await createTestEntry({
        hungarian: 'szilva',
        english: 'plum',
        fieldOfExpertise: 'botany',
        wordType: 'főnév',
      });

      const response = await request(app)
        .post('/entries/bulk')
        .set('Authorization', authHeader(admin))
        .send({ operation: 'delete', entries: [first._id.toString(), second._id.toString()] })
        .expect(200);

      expect(response.body.data).toEqual({ operation: 'delete', matched: 2, modified: 2 });
      expect(response.body.meta.message).toBe('Bulk delete completed successfully');

      // Exactly the two named ids, soft-deleted; the third is left alone.
      expect((await Entry.findById(first._id)).isActive).toBe(false);
      expect((await Entry.findById(second._id)).isActive).toBe(false);
      expect((await Entry.findById(untouched._id)).isActive).toBe(true);
      expect((await Entry.findById(first._id)).updatedBy.toString()).toBe(admin._id.toString());

      const list = await request(app).get('/entries').expect(200);
      expect(list.body.data.map((entry) => entry.hungarian)).toEqual(['szilva']);
    });

    test('should let an admin bulk-update by id', async () => {
      const untouched = await createTestEntry({
        hungarian: 'szilva',
        english: 'plum',
        fieldOfExpertise: 'botany',
        wordType: 'főnév',
      });

      const response = await request(app)
        .post('/entries/bulk')
        .set('Authorization', authHeader(admin))
        .send({
          operation: 'update',
          entries: [first._id.toString(), second._id.toString()],
          updateData: { wordType: 'ige' },
        })
        .expect(200);

      expect(response.body.data).toEqual({ operation: 'update', matched: 2, modified: 2 });

      expect((await Entry.findById(first._id)).wordType).toBe('ige');
      expect((await Entry.findById(second._id)).wordType).toBe('ige');
      expect((await Entry.findById(untouched._id)).wordType).toBe('főnév');

      // An update must not soft-delete anything.
      await expect(Entry.countDocuments({ isActive: true })).resolves.toBe(3);
    });

    test('should match nothing when the ids do not exist', async () => {
      const response = await request(app)
        .post('/entries/bulk')
        .set('Authorization', authHeader(admin))
        .send({ operation: 'delete', entries: [MISSING_ID] })
        .expect(200);

      expect(response.body.data).toMatchObject({ matched: 0, modified: 0 });
      await expect(Entry.countDocuments({ isActive: true })).resolves.toBe(2);
    });

    test('should let an admin bulk-delete by filter', async () => {
      const untouched = await createTestEntry({
        hungarian: 'fonéma',
        english: 'phoneme',
        fieldOfExpertise: 'phonology',
        wordType: 'főnév',
      });

      const response = await request(app)
        .post('/entries/bulk')
        .set('Authorization', authHeader(admin))
        .send({ operation: 'delete', filters: { fieldOfExpertise: 'botany' } })
        .expect(200);

      expect(response.body.data).toEqual({ operation: 'delete', matched: 2, modified: 2 });

      expect((await Entry.findById(first._id)).isActive).toBe(false);
      expect((await Entry.findById(second._id)).isActive).toBe(false);
      expect((await Entry.findById(untouched._id)).isActive).toBe(true);
    });

    test('should let an admin bulk-update by filter', async () => {
      const response = await request(app)
        .post('/entries/bulk')
        .set('Authorization', authHeader(admin))
        .send({
          operation: 'update',
          filters: { fieldOfExpertise: 'botany' },
          updateData: { wordType: 'ige' },
        })
        .expect(200);

      expect(response.body.data.modified).toBe(2);

      const stored = await Entry.find({ isActive: true }).lean();
      stored.forEach((entry) => expect(entry.wordType).toBe('ige'));
    });

    test('should reject Mongo operators smuggled into the filters', async () => {
      const response = await request(app)
        .post('/entries/bulk')
        .set('Authorization', authHeader(admin))
        .send({ operation: 'delete', filters: { fieldOfExpertise: { $ne: 'nothing' } } })
        .expect(400);

      expect(response.body.type).toBe('ValidationError');
      await expect(Entry.countDocuments({ isActive: true })).resolves.toBe(2);
    });

    test('should reject an unknown filter key', async () => {
      await request(app)
        .post('/entries/bulk')
        .set('Authorization', authHeader(admin))
        .send({ operation: 'delete', filters: { isActive: true } })
        .expect(400);
    });

    test('should reject both entries and filters at once', async () => {
      const response = await request(app)
        .post('/entries/bulk')
        .set('Authorization', authHeader(admin))
        .send({
          operation: 'delete',
          entries: [first._id.toString()],
          filters: { fieldOfExpertise: 'botany' },
        })
        .expect(400);

      expect(JSON.stringify(response.body)).toContain('not both');
    });

    test('should reject neither entries nor filters', async () => {
      await request(app)
        .post('/entries/bulk')
        .set('Authorization', authHeader(admin))
        .send({ operation: 'delete' })
        .expect(400);
    });

    test('should reject an update without updateData', async () => {
      await request(app)
        .post('/entries/bulk')
        .set('Authorization', authHeader(admin))
        .send({ operation: 'update', entries: [first._id.toString()] })
        .expect(400);
    });

    test('should reject an unknown operation', async () => {
      await request(app)
        .post('/entries/bulk')
        .set('Authorization', authHeader(admin))
        .send({ operation: 'drop', entries: [first._id.toString()] })
        .expect(400);
    });

    test('should reject a malformed id in the entries array', async () => {
      await request(app)
        .post('/entries/bulk')
        .set('Authorization', authHeader(admin))
        .send({ operation: 'delete', entries: ['not-an-id'] })
        .expect(400);
    });

    test('should reject an entries array beyond the cap', async () => {
      await request(app)
        .post('/entries/bulk')
        .set('Authorization', authHeader(admin))
        .send({ operation: 'delete', entries: Array(1001).fill(MISSING_ID) })
        .expect(400);
    });
  });
});
