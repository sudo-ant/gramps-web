import {describe, expect, it} from 'vitest'
import {FamilyGraph} from '../../src/charts/model/FamilyGraph.js'
import {
  familyTreeLayoutDefaults,
  layoutFamilyTree,
} from '../../src/charts/layout/familyTreeLayout.js'

const childRef = ref => ({ref, frel: 'Birth', mrel: 'Birth'})

const family = (handle, father, mother, children) => ({
  handle,
  father_handle: father,
  mother_handle: mother,
  child_ref_list: children.map(childRef),
})

const person = (
  handle,
  {parentFamily = {}, families = [], sex = 'U'} = {}
) => ({
  handle,
  gramps_id: `I_${handle}`,
  profile: {
    gramps_id: `I_${handle}`,
    name_display: handle,
    name_given: handle,
    name_surname: '',
    sex,
  },
  extended: {
    primary_parent_family: parentFamily,
    families,
  },
})

const visibleBounds = node => ({
  left:
    node.x -
    familyTreeLayoutDefaults.boxWidth / 2 -
    familyTreeLayoutDefaults.sexStripExtent,
  right: node.x + familyTreeLayoutDefaults.boxWidth / 2,
  top: node.y - familyTreeLayoutDefaults.boxHeight / 2,
  bottom: node.y + familyTreeLayoutDefaults.boxHeight / 2,
})

const expectNoCardOverlaps = layout => {
  layout.nodes.forEach((node, index) => {
    const first = visibleBounds(node)
    layout.nodes.slice(index + 1).forEach(other => {
      const second = visibleBounds(other)
      const overlaps =
        first.left < second.right &&
        first.right > second.left &&
        first.top < second.bottom &&
        first.bottom > second.top
      expect(overlaps, `${node.handle} overlaps ${other.handle}`).toBe(false)
    })
  })
}

const expectGenerationBands = layout => {
  const byGeneration = Map.groupBy(layout.nodes, node => node.generation)
  byGeneration.forEach(nodes => {
    expect(new Set(nodes.map(node => node.y))).toHaveLength(1)
  })
}

const expectChildrenCentred = (layout, relationship) => {
  const children = layout.links
    .filter(link => link.relationship === relationship)
    .map(link => link.target)
  expect(children.length).toBeGreaterThan(0)
  expect(
    (Math.min(...children.map(child => child.x)) +
      Math.max(...children.map(child => child.x))) /
      2
  ).toBe(relationship.childX ?? relationship.x)
}

const ancestryPeople = depth => {
  const people = []
  const build = (handle, remaining) => {
    if (remaining === 0) {
      people.push(person(handle))
      return
    }
    const father = `${handle}F`
    const mother = `${handle}M`
    const parents = family(`F_${handle}`, father, mother, [handle])
    people.push(person(handle, {parentFamily: parents}))
    build(father, remaining - 1)
    build(mother, remaining - 1)
  }
  build('R', depth)
  return people
}

const segmentIntersects = (start, end, bounds) => {
  if (start.x === end.x) {
    return (
      start.x > bounds.left &&
      start.x < bounds.right &&
      Math.max(start.y, end.y) > bounds.top &&
      Math.min(start.y, end.y) < bounds.bottom
    )
  }
  return (
    start.y > bounds.top &&
    start.y < bounds.bottom &&
    Math.max(start.x, end.x) > bounds.left &&
    Math.min(start.x, end.x) < bounds.right
  )
}

const expectOrthogonal = points => {
  points.slice(1).forEach((point, index) => {
    const previous = points[index]
    expect(point.x === previous.x || point.y === previous.y).toBe(true)
  })
}

const partnershipLaneOffset = lane =>
  -lane * familyTreeLayoutDefaults.partnershipLaneGap

const coupleStepForTest = () =>
  familyTreeLayoutDefaults.boxWidth +
  familyTreeLayoutDefaults.sexStripExtent +
  familyTreeLayoutDefaults.partnerGap

const expectCompactPartnership = relationship => {
  expect(relationship.y - relationship.person.y).toBe(
    partnershipLaneOffset(relationship.coupleLane)
  )
  relationship.coupleRoute.forEach(route => {
    expect(route).toHaveLength(2)
    expect(new Set(route.map(point => point.y))).toEqual(
      new Set([relationship.y])
    )
    expectOrthogonal(route)
  })
}

const expectMidpointBus = (layout, relationship) => {
  const links = layout.links.filter(link => link.relationship === relationship)
  expect(links.length).toBeGreaterThan(1)
  const parentBottom =
    Math.max(
      ...[relationship.person, relationship.partner]
        .filter(Boolean)
        .map(personNode => personNode.y)
    ) +
    familyTreeLayoutDefaults.boxHeight / 2
  const connectorStart = Math.max(relationship.y, parentBottom)
  const childTop = links[0].target.y - familyTreeLayoutDefaults.boxHeight / 2
  const expectedBusY = connectorStart + (childTop - connectorStart) / 2

  expect(new Set(links.map(link => link.points[1].y))).toEqual(
    new Set([expectedBusY])
  )
  links.forEach(link => {
    expect(link.points.at(-1)).toEqual({x: link.target.x, y: childTop})
  })
}

describe('layoutFamilyTree', () => {
  it('places a focal person without relatives at the origin', () => {
    const layout = layoutFamilyTree(new FamilyGraph([person('R')]), 'R')

    expect(layout.nodes).toHaveLength(1)
    expect(layout.nodes[0]).toMatchObject({handle: 'R', x: 0, y: 0})
    expect(layout.relationships).toHaveLength(0)
  })

  it('places the focal person and partner on the same generation', () => {
    const focalFamily = family('F1', 'R', 'P', ['C1', 'C2'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C1', {parentFamily: focalFamily}),
      person('C2', {parentFamily: focalFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    const root = layout.nodes.find(node => node.handle === 'R')
    const partner = layout.nodes.find(node => node.handle === 'P')

    expect(root.y).toBe(0)
    expect(partner.y).toBe(root.y)
    expect(root.generation).toBe(0)
    expect(partner.generation).toBe(0)

    const left = root.x < partner.x ? root : partner
    const right = root.x < partner.x ? partner : root

    const leftEdge = left.x + familyTreeLayoutDefaults.boxWidth / 2
    const rightEdge = right.x - familyTreeLayoutDefaults.boxWidth / 2

    expect(
      rightEdge - familyTreeLayoutDefaults.sexStripExtent - leftEdge
    ).toBeGreaterThanOrEqual(familyTreeLayoutDefaults.partnerGap)
  })

  it('places the relationship between the focal person and partner', () => {
    const focalFamily = family('F1', 'R', 'P', ['C'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C', {parentFamily: focalFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    const root = layout.nodes.find(node => node.handle === 'R')
    const partner = layout.nodes.find(node => node.handle === 'P')
    const relationship = layout.relationships[0]

    expect(relationship.x).toBe((root.x + partner.x) / 2)
    expect(relationship.y).toBe(root.y)
  })

  it('shows a childless partnership without inventing descendants', () => {
    const focalFamily = family('F1', 'R', 'P', [])
    const layout = layoutFamilyTree(
      new FamilyGraph([
        person('R', {families: [focalFamily]}),
        person('P', {families: [focalFamily]}),
      ]),
      'R',
      {descendantDepth: 1}
    )

    expect(layout.nodes.map(node => node.handle)).toEqual(['R', 'P'])
    expect(layout.relationships).toHaveLength(1)
    expect(layout.relationships[0].family.handle).toBe('F1')
    expect(layout.links).toHaveLength(0)
  })

  it('uses one vertical connector for a single child', () => {
    const focalFamily = family('F1', 'R', 'P', ['C'])
    const layout = layoutFamilyTree(
      new FamilyGraph([
        person('R', {families: [focalFamily]}),
        person('P'),
        person('C', {parentFamily: focalFamily}),
      ]),
      'R',
      {descendantDepth: 1}
    )

    expect(layout.links).toHaveLength(1)
    expect(layout.links[0].points).toHaveLength(2)
    expect(layout.links[0].points[0].x).toBe(layout.links[0].points[1].x)
    expect(layout.links[0].points.at(-1)).toEqual({
      x: layout.links[0].target.x,
      y: layout.links[0].target.y - familyTreeLayoutDefaults.boxHeight / 2,
    })
    expectOrthogonal(layout.links[0].points)
  })

  it('places children below their parents and links them to the relationship', () => {
    const focalFamily = family('F1', 'R', 'P', ['C1', 'C2'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C1', {parentFamily: focalFamily}),
      person('C2', {parentFamily: focalFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    const root = layout.nodes.find(node => node.handle === 'R')
    const children = layout.nodes.filter(node =>
      ['C1', 'C2'].includes(node.handle)
    )

    expect(children).toHaveLength(2)
    expect(children.every(node => node.y > root.y)).toBe(true)
    expect(children.every(node => node.generation === -1)).toBe(true)

    expect(layout.links).toHaveLength(2)
    expect(
      layout.links.every(link => link.source === layout.relationships[0])
    ).toBe(true)
    expect(layout.links.map(link => link.target.handle).sort()).toEqual([
      'C1',
      'C2',
    ])
  })

  it('centres siblings around the relationship', () => {
    const focalFamily = family('F1', 'R', 'P', ['C1', 'C2'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C1', {parentFamily: focalFamily}),
      person('C2', {parentFamily: focalFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    const relationship = layout.relationships[0]
    const children = layout.nodes
      .filter(node => ['C1', 'C2'].includes(node.handle))
      .sort((a, b) => a.x - b.x)

    expect((children[0].x + children[1].x) / 2).toBe(relationship.x)
    const busYs = layout.links.map(treeLink => treeLink.points[1].y)
    expect(new Set(busYs)).toHaveLength(1)
    expectMidpointBus(layout, relationship)
    layout.links.forEach(treeLink => {
      expect(treeLink.points).toHaveLength(4)
      expectOrthogonal(treeLink.points)
    })
  })

  it('uses one sibling bus for an Abraham-style group of eight children', () => {
    const children = Array.from({length: 8}, (_, index) => `C${index + 1}`)
    const focalFamily = family('F1', 'R', 'P', children)
    const layout = layoutFamilyTree(
      new FamilyGraph([
        person('R', {families: [focalFamily]}),
        person('P'),
        ...children.map(handle => person(handle, {parentFamily: focalFamily})),
      ]),
      'R',
      {descendantDepth: 1}
    )

    expect(layout.links).toHaveLength(8)
    expect(
      new Set(layout.links.map(treeLink => treeLink.points[1].y))
    ).toHaveLength(1)
    expect(layout.links.map(treeLink => treeLink.target.handle).sort()).toEqual(
      [...children].sort()
    )
    expectMidpointBus(layout, layout.relationships[0])
    layout.links.forEach(treeLink => expectOrthogonal(treeLink.points))
    expectNoCardOverlaps(layout)
  })

  it('places every displayed generation on one card-centre axis', () => {
    const people = ancestryPeople(3)
    const root = people.find(item => item.handle === 'R')
    const focalFamily = family('FD', 'R', 'P', ['C'])
    root.extended.families = [focalFamily]
    people.push(person('P'), person('C', {parentFamily: focalFamily}))

    const layout = layoutFamilyTree(new FamilyGraph(people), 'R', {
      ancestorDepth: 3,
      descendantDepth: 1,
    })

    expectGenerationBands(layout)
  })

  it('supports a family with no known partner', () => {
    const focalFamily = family('F1', 'R', '', ['C'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('C', {parentFamily: focalFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    expect(layout.nodes.map(node => node.handle).sort()).toEqual(['C', 'R'])
    expect(layout.relationships).toHaveLength(1)
    expect(layout.relationships[0].partner).toBeUndefined()
    expect(layout.relationships[0].x).toBe(0)
  })

  it('includes bounds around all displayed people', () => {
    const focalFamily = family('F1', 'R', 'P', ['C'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C', {parentFamily: focalFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThan(layout.bounds.xMin)
      expect(node.x).toBeLessThan(layout.bounds.xMax)
      expect(node.y).toBeGreaterThan(layout.bounds.yMin)
      expect(node.y).toBeLessThan(layout.bounds.yMax)
    }
  })
  it('keeps multiple partners as separate relationships', () => {
    const firstFamily = family('F1', 'R', 'P1', ['C1'])
    const secondFamily = family('F2', 'R', 'P2', ['C2'])

    const graph = new FamilyGraph([
      person('R', {families: [firstFamily, secondFamily]}),
      person('P1', {families: [firstFamily]}),
      person('P2', {families: [secondFamily]}),
      person('C1', {parentFamily: firstFamily}),
      person('C2', {parentFamily: secondFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    expect(layout.relationships).toHaveLength(2)

    const first = layout.relationships.find(
      relationship => relationship.family.handle === 'F1'
    )
    const second = layout.relationships.find(
      relationship => relationship.family.handle === 'F2'
    )

    expect(first.partner.handle).toBe('P1')
    expect(second.partner.handle).toBe('P2')

    const firstChildren = layout.links
      .filter(link => link.relationship === first)
      .map(link => link.target.handle)

    const secondChildren = layout.links
      .filter(link => link.relationship === second)
      .map(link => link.target.handle)

    expect(firstChildren).toEqual(['C1'])
    expect(secondChildren).toEqual(['C2'])
  })

  it('places different focal partnerships without overlapping partner cards', () => {
    const firstFamily = family('F1', 'R', 'P1', ['C1'])
    const secondFamily = family('F2', 'R', 'P2', ['C2'])

    const graph = new FamilyGraph([
      person('R', {families: [firstFamily, secondFamily]}),
      person('P1', {families: [firstFamily]}),
      person('P2', {families: [secondFamily]}),
      person('C1', {parentFamily: firstFamily}),
      person('C2', {parentFamily: secondFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    const firstPartner = layout.nodes.find(node => node.handle === 'P1')
    const secondPartner = layout.nodes.find(node => node.handle === 'P2')

    expect(firstPartner.x).not.toBe(secondPartner.x)

    const left = firstPartner.x < secondPartner.x ? firstPartner : secondPartner
    const right =
      firstPartner.x < secondPartner.x ? secondPartner : firstPartner

    const leftEdge = left.x + familyTreeLayoutDefaults.boxWidth / 2
    const rightEdge = right.x - familyTreeLayoutDefaults.boxWidth / 2

    expect(rightEdge - leftEdge).toBeGreaterThanOrEqual(
      familyTreeLayoutDefaults.familyGap
    )
    expect(firstPartner.y).toBe(0)
    expect(secondPartner.y).toBe(0)
  })

  it('places childless additional partners opposite the primary partner', () => {
    const firstFamily = family('F1', 'R', 'P1', [])
    const secondFamily = family('F2', 'R', 'P2', [])
    const graph = new FamilyGraph([
      person('R', {families: [firstFamily, secondFamily]}),
      person('P1'),
      person('P2'),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})
    const x = Object.fromEntries(
      layout.nodes.map(node => [node.handle, node.x])
    )

    expect(x.P1).toBeGreaterThan(x.R)
    expect(x.P2).toBeLessThan(x.R)
    expectNoCardOverlaps(layout)
  })

  it('keeps two partnerships and their children on relationship anchors', () => {
    const firstFamily = family('F1', 'R', 'P1', ['C1', 'C2'])
    const secondFamily = family('F2', 'R', 'P2', ['C3'])
    const graph = new FamilyGraph([
      person('R', {families: [firstFamily, secondFamily]}),
      person('P1'),
      person('P2'),
      person('C1', {parentFamily: firstFamily}),
      person('C2', {parentFamily: firstFamily}),
      person('C3', {parentFamily: secondFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})
    const root = layout.nodes.find(node => node.handle === 'R')
    const partners = ['P1', 'P2'].map(handle =>
      layout.nodes.find(node => node.handle === handle)
    )
    const relationships = ['F1', 'F2'].map(handle =>
      layout.relationships.find(item => item.family.handle === handle)
    )

    expect(partners[0].x).toBeGreaterThan(root.x)
    expect(partners[1].x).toBeGreaterThan(root.x)
    expect(partners[1].x).toBeGreaterThan(partners[0].x)
    expect(new Set([root, ...partners].map(node => node.y))).toHaveLength(1)
    relationships.forEach((relationship, index) => {
      expect(relationship.coupleLane).toBe(index)
      expect(relationship.x).toBe((root.x + partners[index].x) / 2)
      expectChildrenCentred(layout, relationship)
    })
    expect(relationships[0].y).toBe(root.y)
    expectCompactPartnership(relationships[1])
  })

  it('keeps partner spacing independent of descendant subtree width', () => {
    const makeGraph = wide => {
      const firstFamily = family('F1', 'R', 'P1', ['C1'])
      const secondFamily = family('F2', 'R', 'P2', ['C2'])
      const firstChildFamily = family(
        'FC1',
        'C1',
        '',
        wide ? ['G1', 'G2', 'G3', 'G4'] : ['G1']
      )
      const secondChildFamily = family('FC2', 'C2', '', ['G5'])
      return new FamilyGraph([
        person('R', {families: [firstFamily, secondFamily]}),
        person('P1'),
        person('P2'),
        person('C1', {
          parentFamily: firstFamily,
          families: [firstChildFamily],
        }),
        person('C2', {
          parentFamily: secondFamily,
          families: [secondChildFamily],
        }),
        ...['G1', 'G2', 'G3', 'G4'].map(handle =>
          person(handle, {parentFamily: firstChildFamily})
        ),
        person('G5', {parentFamily: secondChildFamily}),
      ])
    }
    const narrow = layoutFamilyTree(makeGraph(false), 'R', {
      descendantDepth: 2,
    })
    const wide = layoutFamilyTree(makeGraph(true), 'R', {
      descendantDepth: 2,
    })
    const partnerSpan = layout => {
      const partners = layout.nodes.filter(node =>
        ['P1', 'P2'].includes(node.handle)
      )
      return (
        Math.max(...partners.map(node => node.x)) -
        Math.min(...partners.map(node => node.x))
      )
    }

    expect(partnerSpan(wide)).toBe(partnerSpan(narrow))
    wide.relationships
      .filter(item => ['F1', 'F2'].includes(item.family.handle))
      .forEach(relationship => {
        expectChildrenCentred(wide, relationship)
      })
    expectNoCardOverlaps(wide)
  })

  it('gives every later partner a distinct orthogonal couple lane', () => {
    const families = ['P1', 'P2', 'P3', 'P4'].map((partner, index) =>
      family(`F${index + 1}`, 'R', partner, [])
    )
    const graph = new FamilyGraph([
      person('R', {families}),
      ...families.map(item => person(item.mother_handle)),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})
    const x = Object.fromEntries(
      layout.nodes.map(node => [node.handle, node.x])
    )
    const routed = layout.relationships.filter(item => item.coupleLane)

    expect(x.P1).toBeGreaterThan(x.R)
    expect([x.P2, x.P3, x.P4]).toEqual(
      [...[x.P2, x.P3, x.P4]].sort((a, b) => b - a)
    )
    expect(routed.map(item => item.coupleLane)).toEqual([1, 2, 3])
    expect(routed.every(item => item.coupleRoute.length === 1)).toBe(true)
    expect(routed.map(item => item.y)).toEqual(
      [1, 2, 3].map(partnershipLaneOffset)
    )
    routed.forEach(relationship => {
      const route = relationship.coupleRoute[0]
      const left = Math.min(relationship.person.x, relationship.partner.x)
      const right = Math.max(relationship.person.x, relationship.partner.x)

      expect(route.every(point => point.x >= left && point.x <= right)).toBe(
        true
      )
      expectCompactPartnership(relationship)
    })
    expectNoCardOverlaps(layout)
  })

  it('packs each descendant family around its own children', () => {
    const firstFamily = family('F1', 'R', 'P1', ['C1', 'C2'])
    const secondFamily = family('F2', 'R', 'P2', ['C3'])
    const childFamily1 = family('FC1', 'C1', 'CP1', ['G1'])
    const childFamily2 = family('FC2', 'C1', 'CP2', ['G2'])
    const graph = new FamilyGraph([
      person('R', {families: [firstFamily, secondFamily]}),
      person('P1'),
      person('P2'),
      person('C1', {
        parentFamily: firstFamily,
        families: [childFamily1, childFamily2],
      }),
      person('C2', {parentFamily: firstFamily}),
      person('C3', {parentFamily: secondFamily}),
      person('CP1'),
      person('CP2'),
      person('G1', {parentFamily: childFamily1}),
      person('G2', {parentFamily: childFamily2}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 2})
    const first = layout.relationships.find(item => item.family.handle === 'F1')
    const second = layout.relationships.find(
      item => item.family.handle === 'F2'
    )
    const linkedTo = relationship =>
      layout.links
        .filter(link => link.relationship === relationship)
        .map(link => link.target.handle)

    expect(linkedTo(first)).toEqual(['C1', 'C2'])
    expect(linkedTo(second)).toEqual(['C3'])
    expectNoCardOverlaps(layout)
  })

  it('keeps children with their actual family across three partnerships', () => {
    const families = [
      family('F1', 'R', 'P1', ['C1']),
      family('F2', 'R', 'P2', ['C2', 'C3']),
      family('F3', 'R', 'P3', ['C4']),
    ]
    const graph = new FamilyGraph([
      person('R', {families}),
      ...families.map(item => person(item.mother_handle)),
      ...families.flatMap(item =>
        item.child_ref_list.map(({ref}) => person(ref, {parentFamily: item}))
      ),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})
    const childrenByFamily = Object.fromEntries(
      families.map(item => [
        item.handle,
        layout.links
          .filter(treeLink => treeLink.relationship.family === item)
          .map(treeLink => treeLink.target.handle),
      ])
    )

    expect(layout.nodes.filter(node => node.handle === 'R')).toHaveLength(1)
    expect(layout.relationships).toHaveLength(3)
    expect(childrenByFamily).toEqual({
      F1: ['C1'],
      F2: ['C2', 'C3'],
      F3: ['C4'],
    })
    const relationships = Object.fromEntries(
      layout.relationships.map(relationship => [
        relationship.family.handle,
        relationship,
      ])
    )
    const primaryLinks = layout.links.filter(
      link => link.relationship === relationships.F1
    )
    const laterLinks = layout.links.filter(link =>
      [relationships.F2, relationships.F3].includes(link.relationship)
    )

    expect(relationships.F1.descendantOriginType).toBe('relationship')
    expect(primaryLinks[0].points[0]).toEqual({
      x: relationships.F1.x,
      y: relationships.F1.y,
    })
    laterLinks.forEach(link => {
      const partner = link.relationship.partner
      expect(link.relationship.descendantOriginType).toBe('partner')
      expect(link.points[0]).toEqual({
        x: partner.x,
        y: partner.y + familyTreeLayoutDefaults.boxHeight / 2,
      })
      expect(link.source).toBe(partner)
    })
    expectNoCardOverlaps(layout)
  })

  it('routes a Levi-style subsequent family from the later partner card', () => {
    const primary = family('FLP', 'L', 'P', ['T'])
    const later = family('FLE', 'L', 'E', ['MA', 'JP'])
    const graph = new FamilyGraph([
      person('L', {families: [primary, later]}),
      person('P'),
      person('E'),
      person('T', {parentFamily: primary}),
      person('MA', {parentFamily: later}),
      person('JP', {parentFamily: later}),
    ])

    const layout = layoutFamilyTree(graph, 'L', {descendantDepth: 1})
    const shared = layout.nodes.find(node => node.handle === 'L')
    const laterRelationship = layout.relationships.find(
      relationship => relationship.family.handle === 'FLE'
    )
    const laterLinks = layout.links.filter(
      link => link.relationship === laterRelationship
    )

    expect(laterRelationship.partner.handle).toBe('E')
    expect(laterRelationship.coupleLane).toBe(1)
    expect(laterRelationship.y).toBe(
      shared.y - familyTreeLayoutDefaults.partnershipLaneGap
    )
    expect(laterLinks.map(link => link.target.handle)).toEqual(['MA', 'JP'])
    expect(
      laterLinks.every(link => link.source === laterRelationship.partner)
    ).toBe(true)
    expect(
      new Set(laterLinks.map(link => `${link.points[0].x},${link.points[0].y}`))
    ).toEqual(
      new Set([
        `${laterRelationship.partner.x},${
          laterRelationship.partner.y + familyTreeLayoutDefaults.boxHeight / 2
        }`,
      ])
    )
    expectNoCardOverlaps(layout)
  })

  it('keeps the same Levi-style family correct from the later partner focal view', () => {
    const primary = family('FLP', 'L', 'P', ['T'])
    const later = family('FLE', 'L', 'E', ['MA', 'JP'])
    const graph = new FamilyGraph([
      person('L', {families: [primary, later]}),
      person('P', {families: [primary]}),
      person('E', {families: [later]}),
      person('T', {parentFamily: primary}),
      person('MA', {parentFamily: later}),
      person('JP', {parentFamily: later}),
    ])

    const layout = layoutFamilyTree(graph, 'E', {descendantDepth: 1})
    const relationship = layout.relationships.find(
      item => item.family.handle === 'FLE'
    )
    const links = layout.links.filter(
      link => link.relationship === relationship
    )

    expect(relationship.coupleLane).toBe(0)
    expect(
      [relationship.person.handle, relationship.partner.handle].sort()
    ).toEqual(['E', 'L'])
    expect(relationship.descendantOriginType).toBe('relationship')
    expect(links.map(link => link.target.handle)).toEqual(['MA', 'JP'])
    expect(links.every(link => link.source === relationship)).toBe(true)
    expect(links.every(link => link.points[0].x === relationship.x)).toBe(true)
    expect(layout.nodes.some(node => node.handle === 'T')).toBe(false)
    expectNoCardOverlaps(layout)
  })

  it('connects a one-parent family directly from the known parent', () => {
    const primary = family('F1', 'R', 'P', ['C1'])
    const unknown = family('F2', 'R', '', ['C2'])
    const graph = new FamilyGraph([
      person('R', {families: [primary, unknown]}),
      person('P'),
      person('C1', {parentFamily: primary}),
      person('C2', {parentFamily: unknown}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})
    const relationship = layout.relationships.find(
      item => item.family.handle === 'F2'
    )
    const link = layout.links.find(item => item.relationship === relationship)

    expect(relationship.coupleLane).toBe(1)
    expect(relationship.partner).toBeUndefined()
    expect(relationship.descendantOriginType).toBe('person')
    expect(relationship.coupleRoute).toEqual([])
    expect(link.source).toBe(relationship)
    expect(link.points[0]).toEqual({
      x: relationship.person.x,
      y: relationship.person.y + familyTreeLayoutDefaults.boxHeight / 2,
    })
    expect(layout.nodes.map(node => node.handle).sort()).toEqual([
      'C1',
      'C2',
      'P',
      'R',
    ])
    expectNoCardOverlaps(layout)
  })

  it.each([
    ['Adolf', 'Bertha', 'Mathilde', 'Bernhard'],
    ['David', 'Adelheid', 'BerthaIsaak', 'Hedwig'],
  ])(
    'keeps %s and %s as the parent family when %s is a side partner',
    (father, mother, sidePartner, child) => {
      const primary = family(`F_${father}_${mother}`, father, mother, [child])
      const side = family(`F_${father}_${sidePartner}`, father, sidePartner, [])
      const graph = new FamilyGraph([
        person(child, {parentFamily: primary}),
        person(father, {families: [primary, side], sex: 'M'}),
        person(mother, {families: [primary], sex: 'F'}),
        person(sidePartner, {families: [side], sex: 'F'}),
      ])

      const layout = layoutFamilyTree(graph, child, {
        ancestorDepth: 1,
        descendantDepth: 0,
      })
      const people = Object.fromEntries(
        layout.nodes.map(node => [node.handle, node])
      )
      const primaryRelationship = layout.relationships.find(
        relationship => relationship.family.handle === primary.handle
      )
      const sideRelationship = layout.relationships.find(
        relationship => relationship.family.handle === side.handle
      )
      const parentLink = layout.links.find(link => link.target.handle === child)

      expect(people[sidePartner].x).toBeLessThan(people[father].x)
      expect(people[father].x).toBeLessThan(people[mother].x)
      expect(parentLink.relationship).toBe(primaryRelationship)
      expect(parentLink.source).toBe(primaryRelationship)
      expect(
        layout.links.filter(link => link.relationship === sideRelationship)
      ).toHaveLength(0)
      expect(
        primaryRelationship.x > visibleBounds(people[sidePartner]).right
      ).toBe(true)
      expectNoCardOverlaps(layout)
    }
  )

  it('keeps Gunter-style childless partnerships above the descendant bus', () => {
    const florence = family('FGF', 'G', 'F', ['V', 'S'])
    const betty = family('FGB', 'G', 'B', [])
    const magda = family('FGM', 'G', 'M', [])
    const graph = new FamilyGraph([
      person('G', {families: [florence, betty, magda], sex: 'M'}),
      person('F', {sex: 'F'}),
      person('B', {sex: 'F'}),
      person('M', {sex: 'F'}),
      person('V', {parentFamily: florence}),
      person('S', {parentFamily: florence}),
    ])

    const layout = layoutFamilyTree(graph, 'G', {descendantDepth: 1})
    const repeated = layoutFamilyTree(graph, 'G', {descendantDepth: 1})
    const relationships = Object.fromEntries(
      layout.relationships.map(relationship => [
        relationship.family.handle,
        relationship,
      ])
    )
    const linkedChildren = relationship =>
      layout.links
        .filter(link => link.relationship === relationship)
        .map(link => link.target.handle)

    expect(layout.nodes.filter(node => node.handle === 'G')).toHaveLength(1)
    expect(linkedChildren(relationships.FGF)).toEqual(['V', 'S'])
    expect(linkedChildren(relationships.FGB)).toEqual([])
    expect(linkedChildren(relationships.FGM)).toEqual([])
    expect(relationships.FGB.coupleRoute).toHaveLength(1)
    expect(relationships.FGM.coupleRoute).toHaveLength(1)
    expect(relationships.FGB.y).toBeGreaterThan(relationships.FGM.y)
    const secondaryRelationships = [relationships.FGB, relationships.FGM]
    secondaryRelationships.forEach(relationship => {
      const route = relationship.coupleRoute[0]
      const left = Math.min(relationship.person.x, relationship.partner.x)
      const right = Math.max(relationship.person.x, relationship.partner.x)

      expect(route.every(point => point.x >= left && point.x <= right)).toBe(
        true
      )
      expectCompactPartnership(relationship)
    })
    expect(
      Math.max(
        ...layout.relationships.map(relationship =>
          Math.abs(relationship.y - relationship.person.y)
        )
      )
    ).toBeLessThanOrEqual(2 * familyTreeLayoutDefaults.partnershipLaneGap)
    expect(
      Object.fromEntries(layout.nodes.map(({handle, x, y}) => [handle, {x, y}]))
    ).toEqual({
      G: {x: 0, y: 0},
      F: {x: 218, y: 0},
      V: {x: 0, y: 140},
      S: {x: 218, y: 140},
      B: {x: -218, y: 0},
      M: {x: -444, y: 0},
    })
    expectMidpointBus(layout, relationships.FGF)
    expect(layout.links.map(link => link.points)).toEqual([
      [
        {x: 109, y: 0},
        {x: 109, y: 70},
        {x: 0, y: 70},
        {x: 0, y: 95},
      ],
      [
        {x: 109, y: 0},
        {x: 109, y: 70},
        {x: 218, y: 70},
        {x: 218, y: 95},
      ],
    ])
    const busY = layout.links[0].points[1].y
    expect(Math.max(relationships.FGB.y, relationships.FGM.y)).toBeLessThan(
      busY
    )
    const connectorPoints = [
      ...layout.relationships.flatMap(relationship =>
        relationship.coupleRoute.flat()
      ),
      ...layout.links.flatMap(link => link.points),
    ]
    connectorPoints.forEach(point => {
      expect(point.x).toBeGreaterThanOrEqual(layout.bounds.xMin)
      expect(point.x).toBeLessThanOrEqual(layout.bounds.xMax)
      expect(point.y).toBeGreaterThanOrEqual(layout.bounds.yMin)
      expect(point.y).toBeLessThanOrEqual(layout.bounds.yMax)
    })
    expect(
      repeated.relationships.map(({key, x, y, coupleRoute}) => ({
        key,
        x,
        y,
        coupleRoute,
      }))
    ).toEqual(
      layout.relationships.map(({key, x, y, coupleRoute}) => ({
        key,
        x,
        y,
        coupleRoute,
      }))
    )
    expect(repeated.links.map(({key, points}) => ({key, points}))).toEqual(
      layout.links.map(({key, points}) => ({key, points}))
    )
    expectNoCardOverlaps(layout)
  })

  it('preserves family endpoints when changing between Gunter and Florence focal views', () => {
    const florence = family('FGF', 'G', 'F', ['V', 'S'])
    const betty = family('FGB', 'G', 'B', [])
    const magda = family('FGM', 'G', 'M', [])
    const graph = new FamilyGraph([
      person('G', {families: [florence, betty, magda]}),
      person('F', {families: [florence]}),
      person('B', {families: [betty]}),
      person('M', {families: [magda]}),
      person('V', {parentFamily: florence}),
      person('S', {parentFamily: florence}),
    ])

    const fromGunter = layoutFamilyTree(graph, 'G', {descendantDepth: 1})
    const fromFlorence = layoutFamilyTree(graph, 'F', {descendantDepth: 1})
    const endpoints = layout => {
      const relationship = layout.relationships.find(
        item => item.family.handle === 'FGF'
      )
      return [relationship.person.handle, relationship.partner.handle].sort()
    }

    expect(endpoints(fromGunter)).toEqual(['F', 'G'])
    expect(endpoints(fromFlorence)).toEqual(['F', 'G'])
    expect(fromGunter.relationships.map(item => item.family.handle)).toEqual([
      'FGF',
      'FGB',
      'FGM',
    ])
    expect(fromFlorence.relationships.map(item => item.family.handle)).toEqual([
      'FGF',
    ])
    const focalLayouts = [fromGunter, fromFlorence]
    focalLayouts.forEach(layout => {
      layout.relationships.forEach(relationship => {
        expect(
          [relationship.person.handle, relationship.partner.handle].sort()
        ).toEqual(
          [
            relationship.family.father_handle,
            relationship.family.mother_handle,
          ].sort()
        )
      })
    })
  })

  it('keeps Kenneth parent families out of Florence partnership geometry', () => {
    const biological = family('FFG', 'G', 'F', ['V', 'S', 'K'])
    const adoptive = family('FKA', 'C', 'W', ['K'])
    const graph = new FamilyGraph([
      person('F', {families: [biological]}),
      person('G'),
      {
        ...person('K', {parentFamily: biological}),
        extended: {
          primary_parent_family: biological,
          parent_families: [biological, adoptive],
          families: [adoptive],
        },
      },
      person('V', {parentFamily: biological}),
      person('S', {parentFamily: biological}),
      person('C'),
      person('W'),
    ])

    const layout = layoutFamilyTree(graph, 'F', {descendantDepth: 1})
    const relationships = layout.relationships.map(
      relationship => relationship.family.handle
    )

    expect(layout.nodes.filter(node => node.handle === 'F')).toHaveLength(1)
    expect(layout.nodes.filter(node => node.handle === 'K')).toHaveLength(1)
    expect(layout.nodes.filter(node => node.generation === 0)).toHaveLength(2)
    expect(relationships).toEqual(['FFG'])
    expect(layout.links.map(link => link.target.handle)).toEqual([
      'V',
      'S',
      'K',
    ])
    expectNoCardOverlaps(layout)
  })

  it('keeps a descendant and multiple partners on one card row', () => {
    const focalFamily = family('FR', 'R', 'RP', ['A'])
    const firstFamily = family('FA1', 'A', 'AP1', ['C1', 'C2'])
    const secondFamily = family('FA2', 'A', 'AP2', ['C3'])
    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('RP'),
      person('A', {
        parentFamily: focalFamily,
        families: [firstFamily, secondFamily],
      }),
      person('AP1'),
      person('AP2'),
      person('C1', {parentFamily: firstFamily}),
      person('C2', {parentFamily: firstFamily}),
      person('C3', {parentFamily: secondFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 2})
    const shared = layout.nodes.find(node => node.handle === 'A')
    const partners = ['AP1', 'AP2'].map(handle =>
      layout.nodes.find(node => node.handle === handle)
    )
    const relationships = layout.relationships.filter(item =>
      ['FA1', 'FA2'].includes(item.family.handle)
    )

    expect(new Set([shared, ...partners].map(node => node.y))).toHaveLength(1)
    relationships.forEach((relationship, index) => {
      expect(relationship.coupleLane).toBe(index)
      expect(relationship.x).toBe((shared.x + relationship.partner.x) / 2)
      expectChildrenCentred(layout, relationship)
    })
    expect(relationships[0].y).toBe(shared.y)
    expectCompactPartnership(relationships[1])
    const laterLink = layout.links.find(
      link => link.relationship === relationships[1]
    )
    expect(laterLink.relationship.family.handle).toBe('FA2')
    expect(laterLink.relationship.descendantOriginType).toBe('partner')
    expect(laterLink.points[0]).toEqual({
      x: relationships[1].partner.x,
      y: relationships[1].partner.y + familyTreeLayoutDefaults.boxHeight / 2,
    })
    expectNoCardOverlaps(layout)
  })

  it('expands a descendant relationship when descendant depth allows it', () => {
    const focalFamily = family('F1', 'R', 'P', ['C'])
    const childFamily = family('F2', 'C', 'CP', ['GC'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C', {
        parentFamily: focalFamily,
        families: [childFamily],
      }),
      person('CP', {families: [childFamily]}),
      person('GC', {parentFamily: childFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 2})

    expect(layout.nodes.some(node => node.handle === 'CP')).toBe(true)
    expect(layout.nodes.some(node => node.handle === 'GC')).toBe(true)

    const childRelationship = layout.relationships.find(
      relationship => relationship.family.handle === 'F2'
    )

    expect(childRelationship).toBeDefined()
    expect(childRelationship.person.handle).toBe('C')
    expect(childRelationship.partner.handle).toBe('CP')

    const grandchild = layout.nodes.find(node => node.handle === 'GC')

    expect(grandchild.generation).toBe(-2)
  })

  it('does not expand descendant relationships beyond the requested depth', () => {
    const focalFamily = family('F1', 'R', 'P', ['C'])
    const childFamily = family('F2', 'C', 'CP', ['GC'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C', {
        parentFamily: focalFamily,
        families: [childFamily],
      }),
      person('CP', {families: [childFamily]}),
      person('GC', {parentFamily: childFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    expect(layout.nodes.some(node => node.handle === 'C')).toBe(true)
    expect(layout.nodes.some(node => node.handle === 'CP')).toBe(false)
    expect(layout.nodes.some(node => node.handle === 'GC')).toBe(false)
    expect(
      layout.relationships.some(
        relationship => relationship.family.handle === 'F2'
      )
    ).toBe(false)
  })
  it('keeps a descendant partner clear of the descendant sibling branch', () => {
    const focalFamily = family('F1', 'R', 'P', ['C1', 'C2'])
    const childFamily = family('F2', 'C1', 'CP', ['GC'])

    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      person('P', {families: [focalFamily]}),
      person('C1', {
        parentFamily: focalFamily,
        families: [childFamily],
      }),
      person('C2', {parentFamily: focalFamily}),
      person('CP', {families: [childFamily]}),
      person('GC', {parentFamily: childFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 2})

    const child = layout.nodes.find(node => node.handle === 'C1')
    const childPartner = layout.nodes.find(node => node.handle === 'CP')
    const sibling = layout.nodes.find(node => node.handle === 'C2')

    const occupiedRight =
      Math.max(child.x, childPartner.x) + familyTreeLayoutDefaults.boxWidth / 2

    const siblingLeft = sibling.x - familyTreeLayoutDefaults.boxWidth / 2

    expect(siblingLeft - occupiedRight).toBeGreaterThanOrEqual(
      familyTreeLayoutDefaults.siblingGap
    )
  })

  it('places the focal person parents above the focal person', () => {
    const parents = family('FP', 'F', 'M', ['R'])

    const graph = new FamilyGraph([
      person('R', {parentFamily: parents}),
      person('F', {families: [parents]}),
      person('M', {families: [parents]}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 0,
    })

    const root = layout.nodes.find(node => node.handle === 'R')
    const father = layout.nodes.find(node => node.handle === 'F')
    const mother = layout.nodes.find(node => node.handle === 'M')

    expect(father.generation).toBe(1)
    expect(mother.generation).toBe(1)
    expect(father.y).toBeLessThan(root.y)
    expect(mother.y).toBeLessThan(root.y)
  })

  it('places an ancestor relationship between the two parent cards', () => {
    const parents = family('FP', 'F', 'M', ['R'])

    const graph = new FamilyGraph([
      person('R', {parentFamily: parents}),
      person('F', {families: [parents]}),
      person('M', {families: [parents]}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 0,
    })

    const father = layout.nodes.find(node => node.handle === 'F')
    const mother = layout.nodes.find(node => node.handle === 'M')

    const relationship = layout.relationships.find(
      item => item.family.handle === 'FP'
    )

    expect(relationship).toBeDefined()
    expect(relationship.x).toBe((father.x + mother.x) / 2)
    expect(relationship.y).toBe(father.y)
  })

  it('expands primary ancestry recursively', () => {
    const grandparents = family('FGP', 'GF', 'GM', ['F'])
    const parents = family('FP', 'F', 'M', ['R'])

    const graph = new FamilyGraph([
      person('R', {parentFamily: parents}),
      person('F', {
        parentFamily: grandparents,
        families: [parents],
      }),
      person('M', {families: [parents]}),
      person('GF', {families: [grandparents]}),
      person('GM', {families: [grandparents]}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 2,
      descendantDepth: 0,
    })

    const root = layout.nodes.find(node => node.handle === 'R')
    const father = layout.nodes.find(node => node.handle === 'F')
    const grandfather = layout.nodes.find(node => node.handle === 'GF')
    const grandmother = layout.nodes.find(node => node.handle === 'GM')

    expect(father.generation).toBe(1)
    expect(grandfather.generation).toBe(2)
    expect(grandmother.generation).toBe(2)

    expect(grandfather.y).toBeLessThan(father.y)
    expect(father.y).toBeLessThan(root.y)
  })

  it('does not expand ancestry beyond the requested depth', () => {
    const grandparents = family('FGP', 'GF', 'GM', ['F'])
    const parents = family('FP', 'F', 'M', ['R'])

    const graph = new FamilyGraph([
      person('R', {parentFamily: parents}),
      person('F', {
        parentFamily: grandparents,
        families: [parents],
      }),
      person('M', {families: [parents]}),
      person('GF', {families: [grandparents]}),
      person('GM', {families: [grandparents]}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 0,
    })

    expect(layout.nodes.some(node => node.handle === 'F')).toBe(true)
    expect(layout.nodes.some(node => node.handle === 'M')).toBe(true)
    expect(layout.nodes.some(node => node.handle === 'GF')).toBe(false)
    expect(layout.nodes.some(node => node.handle === 'GM')).toBe(false)
  })
  it('supports ancestry with only one known parent', () => {
    const parents = family('FP', 'F', '', ['R'])

    const graph = new FamilyGraph([
      person('R', {parentFamily: parents}),
      person('F', {families: [parents]}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 0,
    })

    const root = layout.nodes.find(node => node.handle === 'R')
    const father = layout.nodes.find(node => node.handle === 'F')
    const relationship = layout.relationships.find(
      item => item.family.handle === 'FP'
    )

    expect(father).toBeDefined()
    expect(father.generation).toBe(1)
    expect(father.y).toBeLessThan(root.y)
    expect(relationship).toBeDefined()
    expect(relationship.x).toBe(father.x)
  })

  it('keeps an ancestral couple separated by the partner gap', () => {
    const parents = family('FP', 'F', 'M', ['R'])

    const graph = new FamilyGraph([
      person('R', {parentFamily: parents}),
      person('F', {families: [parents]}),
      person('M', {families: [parents]}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 0,
    })

    const father = layout.nodes.find(node => node.handle === 'F')
    const mother = layout.nodes.find(node => node.handle === 'M')

    const left = father.x < mother.x ? father : mother
    const right = father.x < mother.x ? mother : father

    const leftEdge = left.x + familyTreeLayoutDefaults.boxWidth / 2

    const rightEdge = right.x - familyTreeLayoutDefaults.boxWidth / 2

    expect(rightEdge - leftEdge).toBeGreaterThanOrEqual(
      familyTreeLayoutDefaults.partnerGap
    )
  })

  it('packs four balanced ancestor generations without card overlaps', () => {
    const layout = layoutFamilyTree(new FamilyGraph(ancestryPeople(4)), 'R', {
      ancestorDepth: 4,
      descendantDepth: 0,
    })

    expect(layout.nodes.filter(node => node.generation === 4)).toHaveLength(16)
    expect(layout.bounds.xMax - layout.bounds.xMin).toBeLessThan(3600)
    expectNoCardOverlaps(layout)
  })

  it('keeps the first ancestor couple compact in an unbalanced tree', () => {
    const fatherParents = family('FF', 'FF1', 'FM1', ['F'])
    const fatherGrandparents = family('FG', 'FGF', 'FGM', ['FF1'])
    const fatherGreatGrandparents = family('FGG', 'GGF', 'GGM', ['FGF'])
    const rootParents = family('FR', 'F', 'M', ['R'])
    const graph = new FamilyGraph([
      person('R', {parentFamily: rootParents}),
      person('F', {parentFamily: fatherParents}),
      person('M'),
      person('FF1', {parentFamily: fatherGrandparents}),
      person('FM1'),
      person('FGF', {parentFamily: fatherGreatGrandparents}),
      person('FGM'),
      person('GGF'),
      person('GGM'),
    ])

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 4,
      descendantDepth: 0,
    })
    const father = layout.nodes.find(node => node.handle === 'F')
    const mother = layout.nodes.find(node => node.handle === 'M')

    expect(mother.x - father.x).toBe(
      familyTreeLayoutDefaults.boxWidth +
        familyTreeLayoutDefaults.sexStripExtent +
        familyTreeLayoutDefaults.partnerGap
    )
    expect(layout.bounds.xMax - layout.bounds.xMin).toBeLessThan(800)
    expectNoCardOverlaps(layout)
  })

  it('uses the visible sex-strip footprint when separating cards', () => {
    const firstFamily = family('F1', 'R', 'P1', [])
    const secondFamily = family('F2', 'R', 'P2', [])
    const layout = layoutFamilyTree(
      new FamilyGraph([
        person('R', {families: [firstFamily, secondFamily]}),
        person('P1'),
        person('P2'),
      ]),
      'R',
      {descendantDepth: 1}
    )
    const root = visibleBounds(layout.nodes.find(node => node.handle === 'R'))
    const right = visibleBounds(layout.nodes.find(node => node.handle === 'P1'))

    expect(right.left - root.right).toBe(familyTreeLayoutDefaults.partnerGap)
  })

  it('keeps descendant corridors outside cards and lets relationship bands pass behind them', () => {
    const families = ['P1', 'P2', 'P3', 'P4'].map((partner, index) =>
      family(`F${index + 1}`, 'R', partner, [`C${index + 1}`])
    )
    const graph = new FamilyGraph([
      person('R', {families}),
      ...families.flatMap((item, index) => [
        person(item.mother_handle),
        person(`C${index + 1}`, {parentFamily: item}),
      ]),
    ])
    const layout = layoutFamilyTree(graph, 'R', {descendantDepth: 1})

    layout.relationships.forEach(relationship => {
      relationship.coupleRoute.forEach(route =>
        route.forEach(point =>
          expect(point.y - relationship.person.y).toBe(
            partnershipLaneOffset(relationship.coupleLane)
          )
        )
      )
    })
    expect(
      layout.relationships.some(relationship =>
        relationship.coupleRoute.some(route =>
          layout.nodes
            .filter(
              node =>
                node !== relationship.person && node !== relationship.partner
            )
            .some(node =>
              segmentIntersects(route[0], route[1], visibleBounds(node))
            )
        )
      )
    ).toBe(true)
    layout.links.forEach(treeLink => {
      treeLink.points.slice(1).forEach((point, index) => {
        layout.nodes
          .filter(node => node !== treeLink.target)
          .forEach(node => {
            expect(
              segmentIntersects(
                treeLink.points[index],
                point,
                visibleBounds(node)
              ),
              `${treeLink.key} intersects ${node.handle}`
            ).toBe(false)
          })
      })
    })
    expectNoCardOverlaps(layout)
  })

  it('emits only genuine people while completion mode exposes unresolved handles', () => {
    const focalFamily = family('F1', 'R', 'P', ['C'])
    const partialPartner = {
      handle: 'P',
      gramps_id: 'I_P',
      profile: {sex: 'F'},
    }
    const graph = new FamilyGraph([
      person('R', {families: [focalFamily]}),
      partialPartner,
    ])

    const visible = layoutFamilyTree(graph, 'R', {descendantDepth: 1})
    const completion = layoutFamilyTree(graph, 'R', {
      descendantDepth: 1,
      includeUnresolved: true,
    })

    expect(visible.nodes.map(node => node.handle)).toEqual(['R'])
    expect(visible.nodes.every(node => node.person)).toBe(true)
    expect(new Set(completion.nodes.map(node => node.handle))).toEqual(
      new Set(['R', 'P', 'C'])
    )
  })

  it("renders Philip Anthony Levi's explicit Unknown mother without a father", () => {
    const parents = family('F500040', '', 'BLANK', ['PHILIP'])
    const blankMother = {
      handle: 'BLANK',
      gramps_id: 'I500159',
      profile: {
        gramps_id: 'I500159',
        name_display: '',
        name_given: '',
        name_surname: '',
        birth: {},
        death: {date: ''},
        sex: 'F',
      },
      extended: {families: [parents]},
    }
    const graph = new FamilyGraph([
      person('PHILIP', {parentFamily: parents}),
      blankMother,
    ])

    const visible = layoutFamilyTree(graph, 'PHILIP', {ancestorDepth: 1})
    expect(visible.nodes.map(node => node.handle)).toEqual(['PHILIP', 'BLANK'])
    expect(visible.nodes.find(node => node.handle === 'BLANK').person).toBe(
      blankMother
    )
    expect(visible.nodes.filter(node => node.level === 1)).toHaveLength(1)
    expect(visible.relationships).toHaveLength(1)
    expect(visible.relationships[0].person.handle).toBe('BLANK')
    expect(visible.relationships[0].partner).toBeUndefined()
    expect(visible.links).toHaveLength(1)
    expect(visible.links[0].target.handle).toBe('PHILIP')
  })

  it('draws a sole-parent Florence family directly to Kenneth', () => {
    const withGunter = family('FGF', 'G', 'F', ['V', 'S'])
    const kennethFamily = family('FK', '', 'F', ['K'])
    const graph = new FamilyGraph([
      person('F', {
        families: [withGunter, kennethFamily],
        sex: 'F',
      }),
      person('G', {families: [withGunter], sex: 'M'}),
      person('V', {parentFamily: withGunter}),
      person('S', {parentFamily: withGunter}),
      person('K', {parentFamily: kennethFamily}),
    ])

    const layout = layoutFamilyTree(graph, 'F', {descendantDepth: 1})
    const relationship = layout.relationships.find(
      item => item.family.handle === 'FK'
    )
    const link = layout.links.find(item => item.relationship === relationship)
    const florence = layout.nodes.find(node => node.handle === 'F')

    expect(relationship.person).toBe(florence)
    expect(relationship.partner).toBeUndefined()
    expect(relationship.coupleRoute).toEqual([])
    expect(relationship.descendantOriginType).toBe('person')
    expect(link.target.handle).toBe('K')
    expect(link.points[0]).toEqual({
      x: florence.x,
      y: florence.y + familyTreeLayoutDefaults.boxHeight / 2,
    })
  })

  it('keeps Anthony partnerships compact and their children family-owned', () => {
    const withJulia = family('FAJ', 'A', 'J', ['T'])
    const withEliana = family('FAE', 'A', 'E', ['MA', 'JP'])
    const graph = new FamilyGraph([
      person('A', {families: [withJulia, withEliana], sex: 'M'}),
      person('J', {families: [withJulia], sex: 'F'}),
      person('E', {families: [withEliana], sex: 'F'}),
      person('T', {parentFamily: withJulia}),
      person('MA', {parentFamily: withEliana}),
      person('JP', {parentFamily: withEliana}),
    ])

    const layout = layoutFamilyTree(graph, 'A', {descendantDepth: 1})
    const people = Object.fromEntries(
      layout.nodes.map(node => [node.handle, node])
    )
    const relationships = Object.fromEntries(
      layout.relationships.map(item => [item.family.handle, item])
    )

    const childrenOf = relationship =>
      layout.links
        .filter(link => link.relationship === relationship)
        .map(link => link.target.handle)

    expect(people.J.x - people.A.x).toBe(coupleStepForTest())
    expect(people.E.x - people.J.x).toBe(
      familyTreeLayoutDefaults.boxWidth +
        familyTreeLayoutDefaults.sexStripExtent +
        familyTreeLayoutDefaults.familyGap
    )
    expect(childrenOf(relationships.FAJ)).toEqual(['T'])
    expect(childrenOf(relationships.FAE)).toEqual(['MA', 'JP'])
    expect(relationships.FAE.descendantOriginType).toBe('partner')
    expect(
      layout.links
        .filter(link => link.relationship === relationships.FAE)
        .every(link => link.points[0].x === people.E.x)
    ).toBe(true)
    expectNoCardOverlaps(layout)
  })

  it('keeps recorded male/female couples ordered across focal changes', () => {
    const partnership = family('F1', 'A', 'J', [])
    const graph = new FamilyGraph([
      person('A', {families: [partnership], sex: 'M'}),
      person('J', {families: [partnership], sex: 'F'}),
    ])

    for (const focal of ['A', 'J']) {
      const layout = layoutFamilyTree(graph, focal, {descendantDepth: 1})
      const male = layout.nodes.find(node => node.handle === 'A')
      const female = layout.nodes.find(node => node.handle === 'J')
      expect(male.x).toBeLessThan(female.x)
    }
  })

  it('uses stable family endpoint order for unknown and other sex values', () => {
    const partnership = family('F1', 'A', 'J', [])
    const graph = new FamilyGraph([
      person('A', {families: [partnership], sex: 'U'}),
      person('J', {families: [partnership], sex: 'X'}),
    ])

    for (const focal of ['A', 'J']) {
      const layout = layoutFamilyTree(graph, focal, {descendantDepth: 1})
      const first = layout.nodes.find(node => node.handle === 'A')
      const second = layout.nodes.find(node => node.handle === 'J')
      expect(first.x).toBeLessThan(second.x)
    }
  })

  it('orders an ancestor M/F couple by recorded sex without changing roles', () => {
    const parents = family('FP', 'FATHER', 'MOTHER', ['R'])
    const graph = new FamilyGraph([
      person('R', {parentFamily: parents}),
      person('FATHER', {sex: 'F'}),
      person('MOTHER', {sex: 'M'}),
    ])

    const layout = layoutFamilyTree(graph, 'R', {ancestorDepth: 1})
    const recordedMale = layout.nodes.find(node => node.handle === 'MOTHER')
    const recordedFemale = layout.nodes.find(node => node.handle === 'FATHER')
    const relationship = layout.relationships.find(
      item => item.family.handle === 'FP'
    )

    expect(recordedMale.x).toBeLessThan(recordedFemale.x)
    expect(relationship.person.handle).toBe('FATHER')
    expect(relationship.partner.handle).toBe('MOTHER')
  })

  it('marks only known branches beyond configured generation depths', () => {
    const parents = family('FP', 'F', 'M', ['R'])
    const grandparents = family('FG', 'GF', 'GM', ['F'])
    const children = family('FC', 'R', 'P', ['C'])
    const grandchildren = family('FGC', 'C', 'CP', ['GC'])
    const graph = new FamilyGraph([
      person('R', {parentFamily: parents, families: [children]}),
      person('F', {parentFamily: grandparents}),
      person('M'),
      person('P'),
      person('C', {
        parentFamily: children,
        families: [grandchildren],
      }),
      person('GF'),
      person('GM'),
      person('CP'),
      person('GC'),
    ])

    const layout = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 1,
      descendantDepth: 1,
    })
    const people = Object.fromEntries(
      layout.nodes.map(node => [node.handle, node])
    )

    expect(people.F.hasHiddenAncestors).toBe(true)
    expect(people.M.hasHiddenAncestors).toBe(false)
    expect(people.C.hasHiddenDescendants).toBe(true)
    expect(people.R.hasHiddenAncestors).toBe(false)
    expect(people.R.hasHiddenDescendants).toBe(false)
    expect(people.F.continuations).toEqual([
      {
        key: `${people.F.key}:continuation:ancestors`,
        personHandle: 'F',
        direction: 'ancestors',
        familyHandles: ['FG'],
      },
    ])
    expect(people.C.continuations).toEqual([
      {
        key: `${people.C.key}:continuation:descendants`,
        personHandle: 'C',
        direction: 'descendants',
        familyHandles: ['FGC'],
      },
    ])
    expect(people.M.continuations).toEqual([])
    expect(people.R.continuations).toEqual([])
    expect(
      layout.nodes.some(node => ['GF', 'GM', 'CP', 'GC'].includes(node.handle))
    ).toBe(false)
  })

  it('returns deterministic coordinates and bounds containing all geometry', () => {
    const people = ancestryPeople(3)
    const graph = new FamilyGraph(people)
    const first = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 3,
      descendantDepth: 0,
    })
    const second = layoutFamilyTree(graph, 'R', {
      ancestorDepth: 3,
      descendantDepth: 0,
    })
    const coordinates = layout => ({
      nodes: layout.nodes.map(({key, x, y}) => ({key, x, y})),
      relationships: layout.relationships.map(({key, x, y}) => ({key, x, y})),
      links: layout.links.map(({key, points}) => ({key, points})),
      bounds: layout.bounds,
    })

    expect(coordinates(second)).toEqual(coordinates(first))
    first.nodes.forEach(node => {
      const bounds = visibleBounds(node)
      expect(bounds.left).toBeGreaterThanOrEqual(first.bounds.xMin)
      expect(bounds.right).toBeLessThanOrEqual(first.bounds.xMax)
      expect(bounds.top).toBeGreaterThanOrEqual(first.bounds.yMin)
      expect(bounds.bottom).toBeLessThanOrEqual(first.bounds.yMax)
    })
    first.relationships.forEach(relationship => {
      expect(relationship.x).toBeGreaterThanOrEqual(first.bounds.xMin)
      expect(relationship.x).toBeLessThanOrEqual(first.bounds.xMax)
      expect(relationship.y).toBeGreaterThanOrEqual(first.bounds.yMin)
      expect(relationship.y).toBeLessThanOrEqual(first.bounds.yMax)
      relationship.coupleRoute.flat().forEach(point => {
        expect(point.x).toBeGreaterThanOrEqual(first.bounds.xMin)
        expect(point.x).toBeLessThanOrEqual(first.bounds.xMax)
        expect(point.y).toBeGreaterThanOrEqual(first.bounds.yMin)
        expect(point.y).toBeLessThanOrEqual(first.bounds.yMax)
      })
    })
    first.links.forEach(treeLink => {
      treeLink.points.forEach(point => {
        expect(point.x).toBeGreaterThanOrEqual(first.bounds.xMin)
        expect(point.x).toBeLessThanOrEqual(first.bounds.xMax)
        expect(point.y).toBeGreaterThanOrEqual(first.bounds.yMin)
        expect(point.y).toBeLessThanOrEqual(first.bounds.yMax)
      })
    })
  })

  it('keeps focal descendant coordinates independent of ancestor complexity', () => {
    const focalFamily = family('FD', 'R', 'P', ['C1', 'C2'])
    const descendantPeople = [
      person('P'),
      person('C1', {parentFamily: focalFamily}),
      person('C2', {parentFamily: focalFamily}),
    ]
    const simple = layoutFamilyTree(
      new FamilyGraph([
        person('R', {families: [focalFamily]}),
        ...descendantPeople,
      ]),
      'R',
      {ancestorDepth: 0, descendantDepth: 1}
    )
    const ancestors = ancestryPeople(4)
    ancestors.find(item => item.handle === 'R').extended.families = [
      focalFamily,
    ]
    const complex = layoutFamilyTree(
      new FamilyGraph([...ancestors, ...descendantPeople]),
      'R',
      {ancestorDepth: 4, descendantDepth: 1}
    )
    const descendants = layout =>
      Object.fromEntries(
        layout.nodes
          .filter(node => node.generation <= 0)
          .map(node => [node.handle, {x: node.x, y: node.y}])
      )

    expect(descendants(complex)).toEqual(descendants(simple))
  })

  it('keeps ancestor coordinates independent of descendant complexity', () => {
    const ancestors = ancestryPeople(4)
    const simple = layoutFamilyTree(new FamilyGraph(ancestors), 'R', {
      ancestorDepth: 4,
      descendantDepth: 0,
    })
    const firstFamily = family('FD1', 'R', 'P1', ['C1', 'C2', 'C3'])
    const secondFamily = family('FD2', 'R', 'P2', ['C4', 'C5'])
    ancestors.find(item => item.handle === 'R').extended.families = [
      firstFamily,
      secondFamily,
    ]
    const complex = layoutFamilyTree(
      new FamilyGraph([
        ...ancestors,
        person('P1'),
        person('P2'),
        ...['C1', 'C2', 'C3'].map(handle =>
          person(handle, {parentFamily: firstFamily})
        ),
        ...['C4', 'C5'].map(handle =>
          person(handle, {parentFamily: secondFamily})
        ),
      ]),
      'R',
      {ancestorDepth: 4, descendantDepth: 1}
    )
    const ancestryCoordinates = layout =>
      Object.fromEntries(
        layout.nodes
          .filter(node => node.generation > 0)
          .map(node => [node.handle, {x: node.x, y: node.y}])
      )

    expect(ancestryCoordinates(complex)).toEqual(ancestryCoordinates(simple))
  })

  it("lays out an ancestor's additional partnerships without collateral expansion", () => {
    const primary = family('FGV', 'G', 'H', ['V'])
    const firstSide = family('FG1', 'G', 'P1', [])
    const secondSide = family('FG2', 'G', 'P2', [])
    const partnerParents = family('FPP', 'PF', 'PM', ['P1'])
    const graph = new FamilyGraph([
      person('V', {parentFamily: primary}),
      person('G', {families: [primary, firstSide, secondSide]}),
      person('H', {families: [primary]}),
      person('P1', {parentFamily: partnerParents, families: [firstSide]}),
      person('P2', {families: [secondSide]}),
      person('PF'),
      person('PM'),
    ])

    const layout = layoutFamilyTree(graph, 'V', {
      ancestorDepth: 2,
      descendantDepth: 0,
    })
    const handles = layout.nodes.map(node => node.handle)
    const relationships = Object.fromEntries(
      layout.relationships.map(relationship => [
        relationship.family.handle,
        relationship,
      ])
    )

    expect(handles.filter(handle => handle === 'G')).toHaveLength(1)
    expect(handles.filter(handle => handle === 'V')).toHaveLength(1)
    expect(handles).toEqual(expect.arrayContaining(['G', 'H', 'P1', 'P2']))
    expect(handles).not.toEqual(expect.arrayContaining(['PF', 'PM']))
    expect(Object.keys(relationships)).toEqual(
      expect.arrayContaining(['FGV', 'FG1', 'FG2'])
    )
    expect(relationships.FG1.partner.handle).toBe('P1')
    expect(relationships.FG2.partner.handle).toBe('P2')
    expect(relationships.FG1.coupleLane).toBe(1)
    expect(relationships.FG2.coupleLane).toBe(2)
    expect(relationships.FGV.y).toBeGreaterThan(relationships.FG1.y)
    expect(relationships.FG1.y).toBeGreaterThan(relationships.FG2.y)
    expect(
      layout.links
        .filter(link => link.relationship.family.handle === 'FGV')
        .map(link => link.target.handle)
    ).toEqual(['V'])
    expect(
      layout.links.filter(link =>
        ['FG1', 'FG2'].includes(link.relationship.family.handle)
      )
    ).toHaveLength(0)
    expect(layout.relationships).toHaveLength(3)
    expectNoCardOverlaps(layout)
  })
})
