// src/test.ts
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

// Flag tesztekhez
(window as any).__RUNNING_TESTS__ = true;

// ---- Stub window.location navigációk ----
let fakeHref = '';

beforeAll(() => {
  try {
    // href getter
    spyOnProperty(window.location, 'href', 'get').and.callFake(() => fakeHref);
    // href setter
    spyOnProperty(window.location, 'href', 'set').and.callFake((val: string) => {
      fakeHref = val; // swallow
    });

    // metódusok
    if (typeof window.location.assign === 'function') {
      spyOn(window.location, 'assign').and.callFake(() => {});
    }
    if (typeof window.location.replace === 'function') {
      spyOn(window.location, 'replace').and.callFake(() => {});
    }
    if (typeof window.location.reload === 'function') {
      spyOn(window.location, 'reload').and.callFake(() => {});
    }
  } catch {
    // ignore ha már spy-olva van
  }
});

// ---- Angular tesztkörnyezet inicializálás ----
getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting(), {
  teardown: { destroyAfterEach: true } as any,
});
