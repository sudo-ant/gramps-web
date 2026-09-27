import {describe, it, expect} from 'vitest'
import {FamilyGraph} from '../../src/charts/model/FamilyGraph.js'
import {
  layoutAncestors,
  layoutDescendants,
  layoutHourglass,
} from '../../src/charts/layout/treeLayout.js'

const childRef = ref => ({ref, frel: 'Birth', mrel: 'Birth'})

const family = (handle, father, mother, children) => ({
  handle,
  father_handle: father,
  mother_handle: mother,
  child_ref_list: children.map(childRef),
})

const person = (handle, {parentFamily = {}, families = []} = {}) => ({
  handle,
  gramps_id: `I_${handle}`,
  profile: {gramps_id: `I_${handle}`, sex: 'U'},
  extended: {primary_parent_family: parentFamily, families},
})

// R has parents F and M, and children K1 and K2 with S. F has parents FF and
// FM, and M only has a mother MM. K1 has a child X who was not fetched.
const fR = family('fR', 'F', 'M', ['R'])
const fF = family('fF', 'FF', 'FM', ['F'])
const fM = family('fM', '', 'MM', ['M'])
const fK = family('fK', 'R', 'S', ['K1', 'K2'])
const fX = family('fX', 'K1', '', ['X'])
const graph = new FamilyGraph([
  person('R', {parentFamily: fR, families: [fK]}),
  person('F', {parentFamily: fF, families: [fR]}),
  person('M', {parentFamily: fM, families: [fR]}),
  person('FF', {families: [fF]}),
  person('FM', {families: [fF]}),
  person('MM', {families: [fM]}),
  person('S', {families: [fK]}),
  person('K1', {parentFamily: fK, families: [fX]}),
  person('K2', {parentFamily: fK}),
])

const positions = layout =>
  layout.nodes.map(({key, handle, generation, x, y}) => ({
    key,
    handle,
    generation,
    x,
    y,
  }))

const linkKeys = layout =>
  layout.links.map(({source, target}) => [source.key, target.key])

describe('layoutAncestors', () => {
  const layout = layoutAncestors(graph, 'R', {depth: 3})

  it('places generations in columns to the right of the root person', () => {
    expect(positions(layout)).toEqual([
      {key: 'p', handle: 'R', generation: 0, x: 0, y: 0},
      {key: 'pf', handle: 'F', generation: 1, x: 220, y: -71.25},
      {key: 'pm', handle: 'M', generation: 1, x: 220, y: 71.25},
      {key: 'pff', handle: 'FF', generation: 2, x: 440, y: -118.75},
      {key: 'pfm', handle: 'FM', generation: 2, x: 440, y: -23.75},
      {key: 'pmm', handle: 'MM', generation: 2, x: 440, y: 71.25},
    ])
  })

  it('links children to their parents', () => {
    expect(linkKeys(layout)).toEqual([
      ['p', 'pf'],
      ['p', 'pm'],
      ['pf', 'pff'],
      ['pf', 'pfm'],
      ['pm', 'pmm'],
    ])
  })

  it('includes the boxes and horizontal padding in the bounds', () => {
    expect(layout.bounds).toEqual({
      xMin: -115,
      xMax: 555,
      yMin: -163.75,
      yMax: 116.25,
    })
  })

  it('keeps the person objects', () => {
    expect(layout.nodes[1].person).toBe(graph.person('F'))
  })

  it('shows the root person for depth 0', () => {
    expect(positions(layoutAncestors(graph, 'R', {depth: 0}))).toEqual([
      {key: 'p', handle: 'R', generation: 0, x: 0, y: 0},
    ])
  })
})

describe('vertical layout', () => {
  it('places ancestor generations above the root and spreads branches horizontally', () => {
    const layout = layoutAncestors(graph, 'R', {
      depth: 3,
      orientation: 'vertical',
    })

    expect(positions(layout)).toEqual([
      {key: 'p', handle: 'R', generation: 0, x: 0, y: 0},
      {key: 'pf', handle: 'F', generation: 1, x: -170.625, y: -120},
      {key: 'pm', handle: 'M', generation: 1, x: 170.625, y: -120},
      {key: 'pff', handle: 'FF', generation: 2, x: -268.125, y: -240},
      {key: 'pfm', handle: 'FM', generation: 2, x: -73.125, y: -240},
      {key: 'pmm', handle: 'MM', generation: 2, x: 170.625, y: -240},
    ])
  })

  it('places descendant generations below the root and spreads branches horizontally', () => {
    const layout = layoutDescendants(graph, 'R', {
      depth: 3,
      orientation: 'vertical',
    })

    expect(positions(layout)).toEqual([
      {key: 'p', handle: 'R', generation: 0, x: 0, y: 0},
      {key: 'pc0', handle: 'K1', generation: -1, x: -97.5, y: 120},
      {key: 'pc1', handle: 'K2', generation: -1, x: 97.5, y: 120},
      {key: 'pc0c0', handle: undefined, generation: -2, x: -97.5, y: 240},
    ])
  })

  it('places ancestors above and descendants below the root in an hourglass', () => {
    const layout = layoutHourglass(graph, 'R', {
      ancestorDepth: 3,
      descendantDepth: 3,
      orientation: 'vertical',
    })

    const root = layout.nodes.find(node => node.handle === 'R')
    const ancestors = layout.nodes.filter(node => node.generation > 0)
    const descendants = layout.nodes.filter(node => node.generation < 0)

    expect(root.x).toBe(0)
    expect(root.y).toBe(0)
    expect(ancestors.every(node => node.y < 0)).toBe(true)
    expect(descendants.every(node => node.y > 0)).toBe(true)
  })
})

describe('layoutDescendants', () => {
  const layout = layoutDescendants(graph, 'R', {depth: 3, gapX: 60})

  it('places generations in columns to the left of the root person', () => {
    expect(positions(layout)).toEqual([
      {key: 'p', handle: 'R', generation: 0, x: 0, y: 0},
      {key: 'pc0', handle: 'K1', generation: -1, x: -250, y: -47.5},
      {key: 'pc1', handle: 'K2', generation: -1, x: -250, y: 47.5},
      {key: 'pc0c0', handle: undefined, generation: -2, x: -500, y: -47.5},
    ])
  })

  it('places the root person exactly at the origin', () => {
    expect(layout.nodes[0].x).toBe(0)
    expect(layout.nodes[0].generation).toBe(0)
  })

  it('keeps a child that was not fetched as an empty person', () => {
    expect(layout.nodes[3].person).toEqual({})
  })

  it('includes the boxes and horizontal padding in the bounds', () => {
    expect(layout.bounds).toEqual({
      xMin: -615,
      xMax: 115,
      yMin: -92.5,
      yMax: 92.5,
    })
  })
})

describe('layoutHourglass', () => {
  const layout = layoutHourglass(graph, 'R', {
    ancestorDepth: 2,
    descendantDepth: 2,
    gapX: 60,
  })

  it('places ancestors to the right and descendants to the left', () => {
    expect(positions(layout)).toEqual([
      {key: 'p', handle: 'R', generation: 0, x: 0, y: 0},
      {key: 'pf', handle: 'F', generation: 1, x: 250, y: -47.5},
      {key: 'pm', handle: 'M', generation: 1, x: 250, y: 47.5},
      {key: 'pc0', handle: 'K1', generation: -1, x: -250, y: -47.5},
      {key: 'pc1', handle: 'K2', generation: -1, x: -250, y: 47.5},
    ])
  })

  it('shares one root person node between both halves', () => {
    expect(linkKeys(layout)).toEqual([
      ['p', 'pf'],
      ['p', 'pm'],
      ['p', 'pc0'],
      ['p', 'pc1'],
    ])
    expect(layout.links.every(l => l.source === layout.nodes[0])).toBe(true)
  })

  it('includes both halves in the bounds', () => {
    expect(layout.bounds).toEqual({
      xMin: -365,
      xMax: 365,
      yMin: -92.5,
      yMax: 92.5,
    })
  })

  it('keeps the root person when the ancestor depth is 0', () => {
    const shallow = layoutHourglass(graph, 'R', {
      ancestorDepth: 0,
      descendantDepth: 2,
    })
    expect(positions(shallow)).toEqual([
      {key: 'p', handle: 'R', generation: 0, x: 0, y: 0},
      {key: 'pc0', handle: 'K1', generation: -1, x: -220, y: -47.5},
      {key: 'pc1', handle: 'K2', generation: -1, x: -220, y: 47.5},
    ])
    expect(shallow.links.every(l => l.source === shallow.nodes[0])).toBe(true)
  })
})
