# NyelvSzó — frontend

Angular 21 client for the NyelvSzó English–Hungarian linguistic dictionary. It
is a pure API consumer: the dictionary lives in the backend under `../backend`,
which must be running for anything beyond the static pages to work. See the
[repository README](../README.md) for the stack as a whole, the role model and
the API surface.

## Stack

Angular 21 with standalone components, TypeScript 5.9, RxJS, and a purpose-built
CSS design system (no framework),
`@ngx-translate` for the Hungarian and English UI (`src/assets/i18n`),
`ngx-toastr` for notifications and `angular-feather` for icons.

## Configuration

The API base URL is compile-time configuration in `src/environments/`:

| File | `apiUrl` |
|------|----------|
| `environment.ts` (development) | `http://localhost:3000` |
| `environment.prod.ts` (production) | `https://api.nyelvszo.eu` |

The backend must list the origin this app is served from in its
`ALLOWED_ORIGINS`; by default that includes `http://localhost:4200`.

## Development

```bash
npm install
npm start          # http://localhost:4200, reloads on change
```

## Build

```bash
npm run build          # development build
npm run build:prod     # production build
```

Output goes to `dist/nyelvszo`. The production stage of `Dockerfile` serves that
directory from Nginx using `nginx.conf`.

## Tests

Karma and Jasmine, configured in `karma.conf.js`.

```bash
npm test               # headless Chrome, single run
npm run test:watch
npm run test:coverage
```

There is no end-to-end suite in this repository.

## Code quality

```bash
npm run lint           # ESLint, applies --fix
npm run lint:check     # ESLint, report only
npm run format         # Prettier
npm run format:check
npm run analyze        # bundle analysis via webpack-bundle-analyzer
```

## Scaffolding

```bash
npx ng generate component page/my-page
```

`ng generate` also handles directives, pipes, services, guards and interfaces.
Run `npx ng help` for the full command reference.

## Credits

The 403 page is adapted from Piotr Galor's free CodePen template
["Home 403 forbidden (CSS hover)"](https://codepen.io/pgalor/pen/dqQqqx).
