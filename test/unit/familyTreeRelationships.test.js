import {describe, expect, it} from 'vitest'
import {FamilyGraph} from '../../src/charts/model/FamilyGraph.js'
import {
  getFamilyTree,
  getPrimaryAncestry,
} from '../../src/charts/model/familyTree.js'
import {
  familyTreeLayoutDefaults,
  layoutFamilyTree,
} from '../../src/charts/layout/familyTreeLayout.js'
import {FamilyTreeChart} from '../../src/charts/FamilyTreeChart.js'
import {zoomTransform} from 'd3-zoom'

const child = (ref, frel = 'Birth', mrel = 'Birth') => ({ref, frel, mrel})
const family = (handle, father, mother, children) => ({
  handle,
  father_handle: father,
  mother_handle: mother,
  child_ref_list: children,
})
const person = (handle, {families = [], parents = []} = {}) => ({
  handle,
  gramps_id: handle,
  profile: {gramps_id: handle, name_given: handle, sex: 'U'},
  extended: {
    families,
    primary_parent_family: parents[0],
    parent_families: parents,
  },
})
const linksTo = (layout, handle) =>
  layout.links.filter(link => link.target.handle === handle)
const layoutOf = (people, root, options = {}) =>
  layoutFamilyTree(new FamilyGraph(people), root, {
    ancestorDepth: 2,
    descendantDepth: 2,
    ...options,
  })

const expectNoOverlaps = layout => {
  const {boxWidth, boxHeight, sexStripExtent} = familyTreeLayoutDefaults
  layout.nodes.forEach((node, i) => {
    layout.nodes.slice(i + 1).forEach(other => {
      expect(
        Math.abs(node.y - other.y) >= boxHeight ||
          Math.abs(node.x - other.x) >= boxWidth + sexStripExtent,
        `${node.handle} overlaps ${other.handle}`
      ).toBe(true)
    })
  })
}

const expectConnectorsAvoidCards = layout => {
  for (const link of layout.links) {
    const otherCards = layout.nodes.filter(
      node =>
        node !== link.target &&
        node !== link.relationship.person &&
        node !== link.relationship.partner
    )
    for (let i = 1; i < link.points.length; i += 1) {
      const start = link.points[i - 1]
      const end = link.points[i]
      for (const node of otherCards) {
        const {boxWidth, boxHeight, sexStripExtent} = familyTreeLayoutDefaults
        const left = node.x - boxWidth / 2 - sexStripExtent
        const right = node.x + boxWidth / 2
        const top = node.y - boxHeight / 2
        const bottom = node.y + boxHeight / 2
        const crosses =
          start.x === end.x
            ? start.x > left &&
              start.x < right &&
              Math.max(start.y, end.y) > top &&
              Math.min(start.y, end.y) < bottom
            : start.y > top &&
              start.y < bottom &&
              Math.max(start.x, end.x) > left &&
              Math.min(start.x, end.x) < right
        expect(
          crosses,
          `Connector to ${link.target.handle} crosses ${node.handle}`
        ).toBe(false)
      }
    }
  }
}

const expectFiniteGeometry = layout => {
  const values = Object.values(layout.bounds)
  layout.nodes.forEach(node =>
    values.push(node.x, node.y, node.level, node.generation)
  )
  layout.relationships.forEach(relationship => {
    values.push(
      relationship.x,
      relationship.y,
      relationship.level,
      relationship.coupleX,
      relationship.coupleLane
    )
    if (relationship.childX !== undefined) values.push(relationship.childX)
    values.push(
      relationship.descendantOrigin.x,
      relationship.descendantOrigin.y
    )
    relationship.coupleRoute
      .flat()
      .forEach(point => values.push(point.x, point.y))
  })
  layout.links.forEach(link => {
    values.push(link.targetOffset)
    link.points.forEach(point => values.push(point.x, point.y))
  })
  expect(
    values.every(Number.isFinite),
    'All node, relationship, connector and bound coordinates must be finite'
  ).toBe(true)
}

const partialAncestry = ({
  father = '',
  mother = 'MOTHER',
  available = ['GF', 'GM'],
  type = 'Foster',
  reverse = false,
} = {}) => {
  const birth = family('birth', father, mother, [child('CHILD')])
  const upbringing = family('upbringing', 'GF', 'GM', [
    child('CHILD', type, type),
  ])
  const descendants = family('descendants', 'CHILD', 'PARTNER', [
    child('DESCENDANT'),
  ])
  const parents = reverse ? [upbringing, birth] : [birth, upbringing]
  const people = [
    person('CHILD', {parents, families: [descendants]}),
    person('PARTNER', {families: [descendants]}),
    person('DESCENDANT', {parents: [descendants]}),
    ...available.map(handle =>
      person(handle, {
        families: [handle === 'GF' || handle === 'GM' ? upbringing : birth],
      })
    ),
  ]
  return {people, birth, upbringing}
}

describe('partially loaded ancestry', () => {
  const scenarios = [
    {
      name: 'biological mother unavailable; father unspecified',
      expected: ['GF:Foster', 'GM:Foster'],
    },
    {
      name: 'biological father unavailable; mother unspecified',
      father: 'FATHER',
      mother: '',
      expected: ['GF:Foster', 'GM:Foster'],
    },
    {
      name: 'both recorded biological parents unavailable',
      father: 'FATHER',
      expected: ['GF:Foster', 'GM:Foster'],
    },
    {
      name: 'only the biological branch available',
      available: ['MOTHER'],
      expected: ['MOTHER:Birth'],
    },
    {
      name: 'only one foster parent available',
      available: ['GF'],
      expected: ['GF:Foster'],
    },
    {name: 'no ancestry branches available', available: [], expected: []},
    {
      name: 'biological father unavailable; biological mother available',
      father: 'FATHER',
      available: ['MOTHER', 'GF', 'GM'],
      expected: ['MOTHER:Birth', 'GF:Foster', 'GM:Foster'],
    },
    {
      name: 'biological mother unavailable; biological father available',
      father: 'FATHER',
      available: ['FATHER', 'GF', 'GM'],
      expected: ['FATHER:Birth', 'GF:Foster', 'GM:Foster'],
    },
    {
      name: 'both biological parent handles unspecified',
      mother: '',
      expected: ['GF:Foster', 'GM:Foster'],
    },
  ]
  it.each(
    scenarios.flatMap(scenario =>
      [0, 1].map(descendantDepth => ({...scenario, descendantDepth}))
    )
  )('$name; descendant depth $descendantDepth', scenario => {
    const {people, birth, upbringing} = partialAncestry(scenario)
    const graph = new FamilyGraph(people)
    const model = getPrimaryAncestry(graph, 'CHILD', 2)
    // A recorded but unloaded parent remains in the model. An unspecified
    // parent has no node at all; neither is reclassified to another type.
    const birthModel = model.parentFamilies.find(
      parent => parent.family.handle === birth.handle
    )
    if (scenario.mother !== '') {
      expect(birthModel.mother.handle).toBe('MOTHER')
      expect(Boolean(birthModel.mother.person)).toBe(
        (scenario.available ?? ['GF', 'GM']).includes('MOTHER')
      )
    }
    const layout = layoutFamilyTree(graph, 'CHILD', {
      ancestorDepth: 2,
      descendantDepth: scenario.descendantDepth,
    })
    expectFiniteGeometry(layout)
    expectNoOverlaps(layout)
    expect(
      linksTo(layout, 'CHILD')
        .flatMap(link =>
          link.parents.map(parent => `${parent.handle}:${parent.type}`)
        )
        .sort()
    ).toEqual([...scenario.expected].sort())
    expect(
      layout.nodes
        .filter(node => node.ancestry)
        .map(node => node.handle)
        .sort()
    ).toEqual(scenario.expected.map(parent => parent.split(':')[0]).sort())
    expect(graph.parentFamilies('CHILD')).toEqual([birth, upbringing])
    expect(layout.nodes.every(node => node.handle)).toBe(true)
    expect(layout.nodes.some(node => node.handle === 'DESCENDANT')).toBe(
      scenario.descendantDepth === 1
    )
    if (scenario.descendantDepth === 1) {
      expect(
        linksTo(layout, 'DESCENDANT')[0].parents.map(
          parent => `${parent.handle}:${parent.type}`
        )
      ).toEqual(['CHILD:Birth', 'PARTNER:Birth'])
    }
  })

  it.each(['Birth', 'Foster', 'Adopted', 'Stepchild', 'Unknown'])(
    'retains a valid %s branch after an empty primary branch',
    type => {
      const {people} = partialAncestry({type})
      const layout = layoutOf(people, 'CHILD')
      expectFiniteGeometry(layout)
      expect(linksTo(layout, 'CHILD')).toHaveLength(1)
      expect(linksTo(layout, 'CHILD')[0].relationshipType).toBe(type)
      expect(
        linksTo(layout, 'CHILD')[0].parents.map(parent => parent.handle)
      ).toEqual(['GF', 'GM'])
    }
  )

  it.each([false, true])(
    'handles empty branches in either family order: reversed %s',
    reverse => {
      const {people} = partialAncestry({reverse})
      expectFiniteGeometry(layoutOf(people, 'CHILD'))
    }
  )

  it('keeps recorded unresolved parents for completion without inventing unspecified ones', () => {
    const {people} = partialAncestry({available: []})
    const layout = layoutOf(people, 'CHILD', {
      includeUnresolved: true,
      descendantDepth: 0,
    })
    expectFiniteGeometry(layout)
    expect(layout.nodes.map(node => node.handle).sort()).toEqual([
      'CHILD',
      'GF',
      'GM',
      'MOTHER',
    ])
    expect(linksTo(layout, 'CHILD').map(link => link.relationshipType)).toEqual(
      ['Birth', 'Foster']
    )
  })

  it('renders descendants of the available foster family with missing biological records', () => {
    const {people} = partialAncestry()
    const layout = layoutOf(people, 'GF')
    expectFiniteGeometry(layout)
    expectNoOverlaps(layout)
    expect(linksTo(layout, 'CHILD')[0].relationshipType).toBe('Foster')
    expect(linksTo(layout, 'DESCENDANT')[0].relationshipType).toBe('Birth')
    expect(layout.nodes.some(node => node.handle === 'MOTHER')).toBe(false)
  })

  it('adds the subsequently loaded parent without corrupting or resetting the viewport', async () => {
    const {people, birth} = partialAncestry()
    const options = {bboxWidth: 1000, bboxHeight: 700}
    const chart = new FamilyTreeChart()
    const initial = layoutOf(people, 'CHILD')
    expectFiniteGeometry(initial)
    chart.update(initial, options)
    chart.viewport.zoomBy(0.8)
    chart.viewport.panBy(40, -25)
    const rootPosition = () => {
      const [x, y] = chart.node.getAttribute('viewBox').split(',').map(Number)
      const transform = zoomTransform(chart.node)
      return [transform.x - x, transform.y - y]
    }
    const before = rootPosition()
    const loadedMother = await Promise.resolve(
      person('MOTHER', {families: [birth]})
    )
    const loaded = layoutOf([...people, loadedMother], 'CHILD')
    expectFiniteGeometry(loaded)
    chart.update(loaded, options)
    expect(rootPosition()).toEqual(before)
    expect(zoomTransform(chart.node).k).toBeCloseTo(0.8)
    expect(linksTo(loaded, 'CHILD').map(link => link.relationshipType)).toEqual(
      ['Birth', 'Foster']
    )
    expect(chart.node.outerHTML).not.toMatch(/NaN|Infinity/)
    chart.update(loaded, {...options, bboxWidth: 1100})
    expect(zoomTransform(chart.node).k).toBeCloseTo(0.8)
    expect(chart.node.outerHTML).not.toMatch(/NaN|Infinity/)
    chart.viewport.zoomBy(1.25)
    chart.viewport.panBy(-40, 25)
    expect(Number.isFinite(zoomTransform(chart.node).x)).toBe(true)
    expect(Number.isFinite(zoomTransform(chart.node).y)).toBe(true)
  })
})

// Mirrors the supplied F0340/F0326/F0045 API records. Handles are synthetic;
// the family membership, ordering and per-parent relation values are exact.
const verifiedFamilies = () => {
  const birth = {
    ...family('F0340', '', 'MOTHER', [child('KENNETH')]),
    gramps_id: 'F0340',
  }
  const grandparents = {
    ...family('F0326', 'GF', 'GM', [
      child('MOTHER'),
      child('OTHER_CHILD'),
      child('KENNETH', 'Foster', 'Foster'),
    ]),
    gramps_id: 'F0326',
  }
  const later = {
    ...family('F0045', 'GUNTER', 'MOTHER', [child('VERA'), child('SHEILA')]),
    gramps_id: 'F0045',
  }
  const people = [
    {
      ...person('KENNETH', {parents: [birth, grandparents]}),
      parent_family_list: ['F0340', 'F0326'],
    },
    person('MOTHER', {parents: [grandparents], families: [birth, later]}),
    person('GF', {families: [grandparents]}),
    person('GM', {families: [grandparents]}),
    person('OTHER_CHILD', {parents: [grandparents]}),
    person('GUNTER', {families: [later]}),
    person('VERA', {parents: [later]}),
    person('SHEILA', {parents: [later]}),
  ]
  const kenneth = people.find(person => person.handle === 'KENNETH')
  kenneth.gramps_id = 'I0933'
  kenneth.profile.gramps_id = 'I0933'
  return {people, birth, grandparents, later, graph: new FamilyGraph(people)}
}

describe('verified F0340/F0326/F0045 relationship structure', () => {
  it.each(['MOTHER', 'GM'])(
    'separates the mother-only and couple routes when focused on %s',
    focal => {
      const {people} = verifiedFamilies()
      // Putting the couple first reproduces the reported overlap: the two
      // independently calculated midpoint buses lay on top of each other.
      people
        .find(person => person.handle === 'MOTHER')
        .extended.families.reverse()
      const layout = layoutOf(people, focal)
      const biological = layout.links.filter(
        link => link.relationship.family.handle === 'F0340'
      )
      const couple = layout.links.filter(
        link => link.relationship.family.handle === 'F0045'
      )
      expect(biological).toHaveLength(1)
      expect(biological[0].parents).toEqual([
        {role: 'mother', handle: 'MOTHER', type: 'Birth'},
      ])
      expect(couple.map(link => link.target.handle)).toEqual(['VERA', 'SHEILA'])
      for (const oneParent of biological) {
        for (const pair of couple) {
          for (let i = 1; i < oneParent.points.length; i += 1) {
            const a = oneParent.points[i - 1]
            const b = oneParent.points[i]
            for (let j = 1; j < pair.points.length; j += 1) {
              const c = pair.points[j - 1]
              const d = pair.points[j]
              const axis =
                a.y === b.y && c.y === d.y && a.y === c.y
                  ? 'x'
                  : a.x === b.x && c.x === d.x && a.x === c.x
                  ? 'y'
                  : undefined
              const overlap = axis
                ? Math.min(
                    Math.max(a[axis], b[axis]),
                    Math.max(c[axis], d[axis])
                  ) -
                  Math.max(
                    Math.min(a[axis], b[axis]),
                    Math.min(c[axis], d[axis])
                  )
                : 0
              expect(
                overlap,
                'Different families must not share a horizontal or vertical segment'
              ).toBeLessThanOrEqual(0)
            }
          }
        }
      }
      expectFiniteGeometry(layout)
      expectNoOverlaps(layout)
      expectConnectorsAvoidCards(layout)
      // This is a routing change: retain the existing card placement, bounds
      // and legitimate repeated Kenneth cards in the grandparent view.
      expect(
        layout.nodes.filter(node => node.handle === 'KENNETH')
      ).toHaveLength(focal === 'GM' ? 2 : 1)
      expect(
        layout.nodes
          .filter(node =>
            ['MOTHER', 'GUNTER', 'VERA', 'SHEILA', 'KENNETH'].includes(
              node.handle
            )
          )
          .map(({handle, x, y}) => ({handle, x, y}))
      ).toEqual(
        focal === 'MOTHER'
          ? [
              {handle: 'MOTHER', x: 0, y: 0},
              {handle: 'GUNTER', x: -218, y: 0},
              {handle: 'VERA', x: -218, y: 140},
              {handle: 'SHEILA', x: 0, y: 140},
              {handle: 'KENNETH', x: -444, y: 140},
            ]
          : [
              {handle: 'MOTHER', x: -218, y: 140},
              {handle: 'GUNTER', x: -436, y: 140},
              {handle: 'VERA', x: -436, y: 280},
              {handle: 'SHEILA', x: -218, y: 280},
              {handle: 'KENNETH', x: -662, y: 280},
              {handle: 'KENNETH', x: 218, y: 140},
            ]
      )
      expect(layout.bounds).toEqual(
        focal === 'MOTHER'
          ? {xMin: -563, xMax: 224, yMin: -205, yMax: 205}
          : {xMin: -781, xMax: 333, yMin: -65, yMax: 345}
      )
      const chart = new FamilyTreeChart()
      chart.update(layout, {bboxWidth: 1200, bboxHeight: 700})
      const paths = [...chart.node.querySelectorAll('path.link')]
      expect(
        paths
          .filter(path => path.__data__.relationshipType === 'Birth')
          .every(path => !path.hasAttribute('stroke-dasharray'))
      ).toBe(true)
      if (focal === 'GM') {
        expect(
          paths
            .filter(path => path.__data__.relationshipType === 'Foster')
            .every(path => path.getAttribute('stroke-dasharray') === '5 3')
        ).toBe(true)
      }
    }
  )

  it('never invents a parent-child association absent from the child reference list', () => {
    const {graph, birth, grandparents, later} = verifiedFamilies()
    expect(graph.childRelationships(birth, 'KENNETH')).toEqual([
      {role: 'mother', handle: 'MOTHER', type: 'Birth'},
    ])
    expect(graph.childRelationships(grandparents, 'KENNETH')).toEqual([
      {role: 'father', handle: 'GF', type: 'Foster'},
      {role: 'mother', handle: 'GM', type: 'Foster'},
    ])
    expect(graph.childRelationships(later, 'KENNETH')).toEqual([])
  })

  it.each(['KENNETH', 'MOTHER', 'GF', 'GUNTER'])(
    'preserves the recorded connections when focused on %s',
    focal => {
      const {people} = verifiedFamilies()
      const layout = layoutOf(people, focal)
      const edges = layout.links.flatMap(link =>
        link.parents.map(parent => ({
          family: link.relationship.family.handle,
          parent: parent.handle,
          child: link.target.handle,
          type: parent.type,
        }))
      )
      expect(new Set(edges.map(edge => JSON.stringify(edge))).size).toBe(
        edges.length
      )
      expect(
        edges.filter(
          edge => edge.parent === 'GUNTER' && edge.child === 'KENNETH'
        )
      ).toEqual([])
      expect(
        layout.links.some(
          link =>
            link.relationship.family.handle === 'F0045' &&
            link.target.handle === 'KENNETH'
        )
      ).toBe(false)
      for (const link of linksTo(layout, 'KENNETH')) {
        expect(link.relationshipType).toBe(
          link.relationship.family.handle === 'F0340' ? 'Birth' : 'Foster'
        )
      }
      if (focal === 'KENNETH') {
        expect(
          layout.nodes.filter(node => node.handle === 'KENNETH')
        ).toHaveLength(1)
        expect(edges.filter(edge => edge.child === 'KENNETH')).toEqual([
          {family: 'F0340', parent: 'MOTHER', child: 'KENNETH', type: 'Birth'},
          {family: 'F0326', parent: 'GF', child: 'KENNETH', type: 'Foster'},
          {family: 'F0326', parent: 'GM', child: 'KENNETH', type: 'Foster'},
        ])
        const ports = linksTo(layout, 'KENNETH').map(
          link => link.points.at(-1).x
        )
        // Different biological and upbringing families must not overpaint the
        // same terminal connector with both solid and dashed strokes.
        expect(new Set(ports).size).toBe(ports.length)
      }
      if (focal === 'GUNTER') {
        expect(layout.nodes.some(node => node.handle === 'KENNETH')).toBe(false)
      }
      if (focal === 'GF') {
        const familyLinks = layout.links.filter(
          link => link.relationship.family.handle === 'F0326'
        )
        const startsByType = new Map(
          familyLinks.map(link => [link.relationshipType, link.points[0].x])
        )
        expect(new Set(startsByType.values()).size).toBe(2)
      }
      if (focal !== 'KENNETH') {
        for (const handle of ['VERA', 'SHEILA']) {
          expect(edges.filter(edge => edge.child === handle)).toEqual([
            {family: 'F0045', parent: 'GUNTER', child: handle, type: 'Birth'},
            {family: 'F0045', parent: 'MOTHER', child: handle, type: 'Birth'},
          ])
        }
      }
      expectNoOverlaps(layout)
      expectConnectorsAvoidCards(layout)
    }
  )

  it.each([false, true])(
    'keeps the mother-only branch accurate with reversed partnership order: %s',
    reverse => {
      const {people} = verifiedFamilies()
      const mother = people.find(person => person.handle === 'MOTHER')
      if (reverse) mother.extended.families.reverse()
      const layout = layoutOf(people, 'MOTHER')
      const [link] = linksTo(layout, 'KENNETH')
      expect(linksTo(layout, 'KENNETH')).toHaveLength(1)
      expect(link.relationship.family.handle).toBe('F0340')
      expect(link.relationship.partner).toBeUndefined()
      const parent = link.relationship.person
      expect(parent.handle).toBe('MOTHER')
      expect(link.points[0]).toEqual({
        x: parent.x,
        y: parent.y + familyTreeLayoutDefaults.boxHeight / 2,
      })
      expectNoOverlaps(layout)
    }
  )

  it('loads the verified parent families asynchronously and preserves the viewport before focal navigation', async () => {
    const {familyTreeCompletionUrl, mergePeopleByHandle} = await import(
      '../../src/views/treeChartDefinitions.js'
    )
    const {people} = verifiedFamilies()
    let data = people.filter(person => person.handle === 'KENNETH')
    const values = {ancestors: 1, descendants: 1}
    const pending = () => familyTreeCompletionUrl(data, 'I0933', values, 'en')
    const handlesOf = url =>
      new URL(url, 'http://localhost').searchParams.get('handles').split(',')
    const chart = new FamilyTreeChart()
    const options = {
      bboxWidth: 1000,
      bboxHeight: 700,
      relationshipLabel: link =>
        `${link.target.handle}: ${link.parents
          .map(parent => `${parent.handle}: ${parent.type}`)
          .join(', ')}`,
    }
    chart.update(layoutOf(data, 'KENNETH'), options)
    chart.viewport.zoomBy(0.8)
    chart.viewport.panBy(40, -25)
    const rootPosition = () => {
      const [left, top] = chart.node
        .getAttribute('viewBox')
        .split(',')
        .map(Number)
      const transform = zoomTransform(chart.node)
      return [transform.x - left, transform.y - top]
    }
    const before = rootPosition()
    expect(new Set(handlesOf(pending()))).toEqual(
      new Set(['MOTHER', 'GF', 'GM'])
    )
    data = mergePeopleByHandle(
      data,
      await Promise.resolve(
        people.filter(person => ['MOTHER', 'GF', 'GM'].includes(person.handle))
      )
    )
    expect(handlesOf(pending())).toEqual(['GUNTER'])
    data = mergePeopleByHandle(
      data,
      await Promise.resolve(people.filter(person => person.handle === 'GUNTER'))
    )
    expect(pending()).toBe('')
    chart.update(layoutOf(data, 'KENNETH'), options)
    expect(rootPosition()).toEqual(before)
    expect(zoomTransform(chart.node).k).toBeCloseTo(0.8)
    const paths = [...chart.node.querySelectorAll('path.link')].filter(
      path => path.__data__.target.handle === 'KENNETH'
    )
    expect(paths).toHaveLength(2)
    const foster = paths.find(
      path => path.__data__.relationshipType === 'Foster'
    )
    const birth = paths.find(path => path.__data__.relationshipType === 'Birth')
    expect(foster.getAttribute('stroke-dasharray')).toBe('5 3')
    expect(foster.getAttribute('aria-label')).toBe(
      'KENNETH: GF: Foster, GM: Foster'
    )
    expect(foster.getAttribute('tabindex')).toBe('0')
    expect(birth.hasAttribute('stroke-dasharray')).toBe(false)
    expect(birth.getAttribute('aria-label')).toBe('KENNETH: MOTHER: Birth')
    expect(
      chart.node.querySelector('text.child-relationship-label').textContent
    ).toBe('Foster')
    expect(foster.getAttribute('aria-label')).not.toContain('Adopted')
    // A genuine focal change still centres at the existing zoom. Only the
    // children actually listed in F0045 appear in Gunter's descendant chart.
    chart.update(layoutOf(people, 'GUNTER'), options)
    expect(rootPosition()).toEqual([500, 350])
    expect(zoomTransform(chart.node).k).toBeCloseTo(0.8)
    const descendantPaths = [...chart.node.querySelectorAll('path.link')]
    expect(descendantPaths.map(path => path.__data__.target.handle)).toEqual([
      'VERA',
      'SHEILA',
    ])
    expect(
      descendantPaths.every(path => !path.hasAttribute('stroke-dasharray'))
    ).toBe(true)
  })
})

describe('custom Family Tree child-parent semantics', () => {
  it('keeps multiple relationship-type departures in the gap between partner cards', () => {
    const types = [
      'Birth',
      'Foster',
      'Adopted',
      'Stepchild',
      'Sponsored',
      'Unknown',
      'Guardian',
    ]
    const record = family(
      'mixed-types',
      'F',
      'M',
      types.map((type, index) => child(`C${index}`, type, type))
    )
    const layout = layoutOf(
      [
        person('F', {families: [record]}),
        person('M'),
        ...types.map((_, index) => person(`C${index}`)),
      ],
      'F'
    )
    const parent = layout.nodes.find(node => node.handle === 'F')
    const partner = layout.nodes.find(node => node.handle === 'M')
    const left =
      Math.min(parent.x, partner.x) + familyTreeLayoutDefaults.boxWidth / 2
    const right =
      Math.max(parent.x, partner.x) -
      familyTreeLayoutDefaults.boxWidth / 2 -
      familyTreeLayoutDefaults.sexStripExtent
    const starts = layout.links.map(link => link.points[0].x)
    expect(new Set(starts).size).toBe(types.length)
    for (const x of starts) {
      expect(x).toBeGreaterThan(left)
      expect(x).toBeLessThan(right)
    }
  })

  it('routes a child of a previous relationship from the birth mother, never her later partner', () => {
    const later = family('later', 'PARTNER', 'MOTHER', [
      child('OLDER', 'None', 'Birth'),
      child('JOINT'),
    ])
    const people = [
      person('PARTNER', {families: [later]}),
      person('MOTHER', {families: [later]}),
      person('OLDER', {parents: [later]}),
      person('JOINT'),
    ]
    for (const root of ['PARTNER', 'MOTHER']) {
      const layout = layoutOf(people, root)
      const [link] = linksTo(layout, 'OLDER')
      expect(link.parents).toEqual([
        {role: 'mother', handle: 'MOTHER', type: 'Birth'},
      ])
      expect(link.source.handle).toBe('MOTHER')
      expect(link.points[0]).toEqual({x: link.source.x, y: link.source.y + 45})
      expect(
        linksTo(layout, 'JOINT')[0].parents.map(parent => parent.handle)
      ).toEqual(['PARTNER', 'MOTHER'])
      expectNoOverlaps(layout)
    }
    const ancestry = getPrimaryAncestry(new FamilyGraph(people), 'OLDER', 1)
    expect(ancestry.parentFamily.father).toBeUndefined()
    expect(ancestry.parentFamily.mother.handle).toBe('MOTHER')
  })

  it('keeps an unknown-father biological family separate from a later union', () => {
    const birth = family('birth', '', 'MOTHER', [child('OLDER')])
    const later = family('later', 'PARTNER', 'MOTHER', [child('JOINT')])
    const people = [
      person('MOTHER', {families: [birth, later]}),
      person('PARTNER', {families: [later]}),
      person('OLDER', {parents: [birth]}),
      person('JOINT', {parents: [later]}),
    ]
    const layout = layoutOf(people, 'MOTHER')
    expect(linksTo(layout, 'OLDER')[0].parents).toEqual([
      {role: 'mother', handle: 'MOTHER', type: 'Birth'},
    ])
    expect(linksTo(layout, 'OLDER')[0].relationship.partner).toBeUndefined()
    expect(linksTo(layout, 'JOINT')[0].relationship.family.handle).toBe('later')
    expect(
      layoutOf(people, 'PARTNER').nodes.some(node => node.handle === 'OLDER')
    ).toBe(false)
    const ancestry = layoutOf(people, 'OLDER')
    // The mother's later partner can remain as a side partnership, but is
    // never an additional parent of the older child.
    expect(linksTo(ancestry, 'OLDER')).toHaveLength(1)
    expect(
      linksTo(ancestry, 'OLDER')[0].parents.map(parent => parent.handle)
    ).toEqual(['MOTHER'])
    expect(ancestry.nodes.some(node => !node.handle)).toBe(false)
  })

  it('preserves biological and foster-grandparent connections on a single focal child', () => {
    const birth = family('birth', '', 'MOTHER', [child('CHILD')])
    const grandparents = family('grandparents', 'GF', 'GM', [
      child('MOTHER'),
      child('CHILD', 'Foster', 'Foster'),
    ])
    const people = [
      person('CHILD', {parents: [birth, grandparents]}),
      person('MOTHER', {families: [birth], parents: [grandparents]}),
      person('GF', {families: [grandparents]}),
      person('GM', {families: [grandparents]}),
    ]
    const graph = new FamilyGraph(people)
    const model = getPrimaryAncestry(graph, 'CHILD', 2)
    expect(model.parentFamilies).toHaveLength(2)
    const layout = layoutOf(people, 'CHILD')
    expect(layout.nodes.filter(node => node.handle === 'CHILD')).toHaveLength(1)
    expect(linksTo(layout, 'CHILD').map(link => link.relationshipType)).toEqual(
      ['Birth', 'Foster']
    )
    expect(linksTo(layout, 'MOTHER')[0].relationshipType).toBe('Birth')
    expect(
      linksTo(layout, 'CHILD')
        .find(link => link.relationshipType === 'Foster')
        .parents.map(parent => parent.handle)
    ).toEqual(['GF', 'GM'])
    expectNoOverlaps(layout)
    for (const items of [layout.nodes, layout.relationships, layout.links]) {
      expect(new Set(items.map(item => item.key)).size).toBe(items.length)
    }
    const chart = new FamilyTreeChart()
    const options = {bboxWidth: 800, bboxHeight: 600}
    chart.update(layout, options)
    const groups = [...chart.node.querySelectorAll('.partnership-relationship')]
    chart.update(layoutOf(people, 'CHILD'), options)
    expect([
      ...chart.node.querySelectorAll('.partnership-relationship'),
    ]).toEqual(groups)
    const descendants = getFamilyTree(graph, 'GF', 2)
    expect(descendants.families[0].children.map(node => node.handle)).toEqual([
      'MOTHER',
      'CHILD',
    ])
    expect(
      layoutOf(people, 'GF').links.some(
        link =>
          link.target.handle === 'CHILD' && link.relationshipType === 'Foster'
      )
    ).toBe(true)
  })

  it.each([
    'Adopted',
    'Stepchild',
    'Foster',
    'Sponsored',
    'Unknown',
    'Guardian',
  ])('keeps %s distinct from Birth and from None', type => {
    const mixed = family('mixed', 'PARENT', 'MOTHER', [child('CHILD', type)])
    const layout = layoutOf(
      [
        person('PARENT', {families: [mixed]}),
        person('MOTHER'),
        person('CHILD'),
      ],
      'PARENT'
    )
    const links = linksTo(layout, 'CHILD')
    expect(links.map(link => link.relationshipType)).toEqual([type, 'Birth'])
    expect(links[0].source.handle).toBe('PARENT')
    expect(links[1].source.handle).toBe('MOTHER')
    expect(links[0].points.at(-1).x).not.toBe(links[1].points.at(-1).x)
    expect(new Set(links.map(link => link.routeKey)).size).toBe(2)
  })

  it('does not assume Birth for missing type data or add parents with empty handles', () => {
    const record = family('unknown', '', 'MOTHER', [{ref: 'CHILD'}])
    const graph = new FamilyGraph([
      person('MOTHER', {families: [record]}),
      person('CHILD'),
    ])
    expect(graph.childRelationships(record, 'CHILD')).toEqual([
      {role: 'mother', handle: 'MOTHER', type: 'Unknown'},
    ])
    expect(layoutFamilyTree(graph, 'MOTHER').links[0].relationshipType).toBe(
      'Unknown'
    )
    const noParents = family('none', 'X', 'Y', [child('CHILD', 'None', 'None')])
    expect(graph.childRelationships(noParents, 'CHILD')).toEqual([])
  })

  it('does not duplicate a child reference within a family or mix children of different unions', () => {
    const first = family('first', 'PARENT', 'P1', [child('C1'), child('C1')])
    const second = family('second', 'PARENT', 'P2', [
      child('C2', 'Adopted', 'Adopted'),
    ])
    const layout = layoutOf(
      [
        person('PARENT', {families: [first, second]}),
        person('P1'),
        person('P2'),
        person('C1'),
        person('C2'),
      ],
      'PARENT'
    )
    expect(layout.nodes.filter(node => node.handle === 'C1')).toHaveLength(1)
    expect(linksTo(layout, 'C1')[0].relationship.family.handle).toBe('first')
    expect(linksTo(layout, 'C2')[0].relationship.family.handle).toBe('second')
    expect(linksTo(layout, 'C2')[0].relationshipType).toBe('Adopted')
    const chart = new FamilyTreeChart()
    chart.update(layout, {bboxWidth: 800, bboxHeight: 600})
    expect(
      chart.node.querySelectorAll('path.link.subsequent-family-descendant')
    ).toHaveLength(1)
    expectNoOverlaps(layout)
  })

  it('renders dashed upbringing routes with visible labels, keyboard access and an explanation', () => {
    const foster = family('foster', 'F', 'M', [
      child('C1', 'Foster', 'Foster'),
      child('C2'),
    ])
    const people = [
      person('F', {families: [foster]}),
      person('M'),
      person('C1'),
      person('C2'),
    ]
    const chart = new FamilyTreeChart()
    const options = {
      bboxWidth: 800,
      bboxHeight: 600,
      relationshipLabel: link =>
        `${link.target.handle}: ${link.parents
          .map(parent => `${parent.handle}: ${parent.type}`)
          .join(', ')}`,
      relationshipTypeLabel: type => (type === 'Foster' ? 'Pflege' : type),
    }
    chart.update(layoutOf(people, 'F'), options)
    const paths = [...chart.node.querySelectorAll('path.link')]
    const fosterPath = paths.find(
      path => path.__data__.relationshipType === 'Foster'
    )
    const birthPath = paths.find(
      path => path.__data__.relationshipType === 'Birth'
    )
    expect(fosterPath.getAttribute('stroke-dasharray')).toBe('5 3')
    expect(fosterPath.getAttribute('tabindex')).toBe('0')
    expect(fosterPath.getAttribute('aria-label')).toBe(
      'C1: F: Foster, M: Foster'
    )
    expect(fosterPath.querySelector('title').textContent).toBe(
      'C1: F: Foster, M: Foster'
    )
    expect(birthPath.hasAttribute('stroke-dasharray')).toBe(false)
    expect(
      chart.node.querySelector('text.child-relationship-label').textContent
    ).toBe('Pflege')
    const buses = [
      ...chart.node.querySelectorAll('.relationship-descendant-route'),
    ]
    expect(
      buses.some(path => path.getAttribute('stroke-dasharray') === '5 3')
    ).toBe(true)
    // The Birth bus must not overwrite the dashed route.
    expect(new Set(buses.map(path => path.getAttribute('d'))).size).toBe(
      buses.length
    )
    const birthOnly = family('foster', 'F', 'M', [child('C1'), child('C2')])
    chart.update(
      layoutOf([person('F', {families: [birthOnly]}), ...people.slice(1)], 'F'),
      options
    )
    expect(chart.node.querySelector('text.child-relationship-label')).toBeNull()
    expect(
      [...chart.node.querySelectorAll('path.link')].every(
        path => !path.hasAttribute('stroke-dasharray')
      )
    ).toBe(true)
  })
})
