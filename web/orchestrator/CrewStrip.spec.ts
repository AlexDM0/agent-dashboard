/**
 * The crew strip, the project rail and the Fleet row read as static markup with an ended, an absent and a live product
 * owner: an ended or absent one leaves nothing of itself, the strip's half only "+ New ticket", while a live one shows
 * its glyph, name, state and last action as before, prefixed "Sparring: " or "Filing: " by its start mode. A product
 * owner with no mode, recorded before modes or served by an older server without the field, and the orchestrator read
 * their last action plain.
 */
import { expect, test }         from 'bun:test';
import { createElement }        from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { OrchestratorSession }                     from '../../src/shared/DashboardContract.ts';
import { ProjectRail }                                  from '../board/ProjectRail.tsx';
import { FleetRow }                                     from '../fleet/FleetRow.tsx';
import { orchestratorSessionWith, projectSnapshotWith } from '../testing/SnapshotFixtures.ts';
import { CrewStrip }                                    from './CrewStrip.tsx';
import { OrchestratorSessionUtil }                      from './OrchestratorSessionUtil.ts';

const LAST_ACTION = { at: '2026-10-21T11:00:00Z', text: 'Read example-file' };
const ENDED_PRODUCT_OWNER = orchestratorSessionWith({ sessionId: 'product-owner-ended', state: 'ended', lastAction: LAST_ACTION });
const LIVE_PRODUCT_OWNER = orchestratorSessionWith({ sessionId: 'product-owner-live', state: 'busy', lastAction: LAST_ACTION });

function projectWith(productOwner: OrchestratorSession | null) {
  return projectSnapshotWith('example-project', { orchestrator: orchestratorSessionWith({ state: 'busy' }), productOwner });
}

function productOwnerHalfOf(productOwner: OrchestratorSession | null): string {
  const markup = renderToStaticMarkup(createElement(CrewStrip, {
    project: projectWith(productOwner), watchedSessions: [], isDrawerOpen: false, drawerId: 'crew-example', stripReference: { current: null }, onOpenDrawer: () => undefined
  }));
  return markup.slice(markup.indexOf('ap-crew-strip-divider'));
}

function railMarkupOf(productOwner: OrchestratorSession | null): string {
  const project = projectWith(productOwner);
  return renderToStaticMarkup(createElement(ProjectRail, { projects: [project], watchedOrchestratorsByTracker: {}, selectedTrackerId: project.trackerId }));
}

function fleetMarkupOf(productOwner: OrchestratorSession | null): string {
  return renderToStaticMarkup(createElement(FleetRow, {
    project: projectWith(productOwner), watchedSessions: [], now: Date.parse('2026-10-21T11:05:00Z'), onOpenChat: () => undefined, onOpenProductOwner: () => undefined
  }));
}

test('an ended or absent product owner leaves only "+ New ticket" in the strip', () => {
  for (const productOwner of [ENDED_PRODUCT_OWNER, null]) {
    const half = productOwnerHalfOf(productOwner);
    expect(half).toContain('+ New ticket');
    expect(half).not.toContain('Product owner');
    expect(half).not.toContain('>PO<');
    expect(half).not.toContain('ap-pill');
    expect(half).not.toContain('ap-context-meter');
    expect(half).not.toContain('Read example-file');
    expect(half).not.toContain('No product owner runs');
  }
});

test('a live product owner shows its glyph, name, state and last action beside "+ New ticket"', () => {
  const half = productOwnerHalfOf(LIVE_PRODUCT_OWNER);
  expect(half).toContain('>PO<');
  expect(half).toContain('Product owner');
  expect(half).toContain('>busy<');
  expect(half).toContain('Read example-file');
  expect(half).toContain('+ New ticket');
});

test('a live product owner\'s last action reads "Sparring: " or "Filing: " by the mode it was started in', () => {
  expect(productOwnerHalfOf({ ...LIVE_PRODUCT_OWNER, productOwnerMode: 'spar' })).toContain('>Sparring: Read example-file<');
  expect(productOwnerHalfOf({ ...LIVE_PRODUCT_OWNER, productOwnerMode: 'file' })).toContain('>Filing: Read example-file<');
});

test('the orchestrator\'s last action reads plain, whatever mode its session carries', () => {
  const orchestrator = orchestratorSessionWith({ state: 'busy', lastAction: LAST_ACTION, productOwnerMode: 'spar' });
  const markup = renderToStaticMarkup(createElement(CrewStrip, {
    project:         projectSnapshotWith('example-project', { orchestrator, productOwner: null }),
    watchedSessions: [],
    isDrawerOpen:    false,
    drawerId:        'crew-example',
    stripReference:  { current: null },
    onOpenDrawer:    () => undefined
  }));
  const orchestratorHalf = markup.slice(0, markup.indexOf('ap-crew-strip-divider'));
  expect(orchestratorHalf).toContain('>Read example-file<');
  expect(orchestratorHalf).not.toContain('Sparring');
});

test('a product owner with no mode recorded, or from a snapshot without the field, reads its last action plain', () => {
  expect(productOwnerHalfOf({ ...LIVE_PRODUCT_OWNER, productOwnerMode: null })).toContain('>Read example-file<');
  const withoutModeField = Object.fromEntries(Object.entries(LIVE_PRODUCT_OWNER).filter(([field]) => field !== 'productOwnerMode'));
  const half = productOwnerHalfOf(withoutModeField as unknown as OrchestratorSession);
  expect(half).toContain('>Read example-file<');
  expect(half).not.toContain('undefined');
});

test('"+ New ticket" starts a product owner when the one shown has ended', () => {
  expect(OrchestratorSessionUtil.canStart(projectWith(ENDED_PRODUCT_OWNER), 'product-owner')).toBe(true);
  expect(OrchestratorSessionUtil.canStart(projectWith(null), 'product-owner')).toBe(true);
  expect(OrchestratorSessionUtil.canStart(projectWith(LIVE_PRODUCT_OWNER), 'product-owner')).toBe(false);
});

test('the rail shows no PO glyph for an ended or absent product owner, and one for a live one', () => {
  expect(railMarkupOf(ENDED_PRODUCT_OWNER)).not.toContain('>PO<');
  expect(railMarkupOf(null)).not.toContain('>PO<');
  expect(railMarkupOf(LIVE_PRODUCT_OWNER)).toContain('>PO<');
});

test('the Fleet row offers a start instead of an ended product owner, and lines up a live one', () => {
  const endedRow = fleetMarkupOf(ENDED_PRODUCT_OWNER);
  expect(endedRow).not.toContain('>PO<');
  expect(endedRow).not.toContain('Read example-file');
  expect(endedRow).toContain('+ Ask PO for a ticket');
  const liveRow = fleetMarkupOf(LIVE_PRODUCT_OWNER);
  expect(liveRow).toContain('>PO<');
  expect(liveRow).not.toContain('+ Ask PO for a ticket');
});
