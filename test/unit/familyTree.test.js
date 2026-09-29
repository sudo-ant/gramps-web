import {describe, expect, it} from 'vitest'
import {FamilyGraph} from '../../src/charts/model/FamilyGraph.js'
import {
  getFamilyTree,
  getPrimaryAncestry,
} from '../../src/charts/model/familyTree.js'

const childRef = ref => ({ref, frel: 'Birth', mrel: 'Birth'})

const family = (handle, father, mother, children) => ({
  handle,
  father_handle: father,
  mother_handle: mother,
  child_ref_list: children.map(childRef),
})

const person = (
  handle,
  {parentFamily = {}, parentFamilies = [], families = []} = {}
) => ({
  handle,
  gramps_id: `I_${handle}`,
  profile: {
    gramps_id: `I_${handle}`,
    name_display: handle,
    name_given: handle,
    name_surname: '',
    sex: 'U',
  },
  extended: {
    primary_parent_family: parentFamily,
    parent_families: parentFamilies,
    families,
  },
})

describe('getFamilyTree', () => {
  it('keeps a partner and their children together as a family', () => {
    const f1 = family('f1', 'R', 'S', ['K1', 'K2'])
    const graph = new FamilyGraph([
      person('R', {families: [f1]}),
      person('S', {families: [f1]}),
      person('K1', {parentFamily: f1}),
      person('K2', {parentFamily: f1}),
    ])

    const tree = getFamilyTree(graph, 'R', 2)

    expect(tree.handle).toBe('R')
    expect(tree.person).toBe(graph.person('R'))
    expect(tree.families).toHaveLength(1)

    expect(tree.families[0].partnerHandle).toBe('S')
    expect(tree.families[0].partner).toBe(graph.person('S'))
    expect(tree.families[0].children.map(child => child.handle)).toEqual([
      'K1',
      'K2',
    ])
  })

  it('keeps children with the correct partner when there are multiple families', () => {
    const f1 = family('f1', 'R', 'S1', ['K1', 'K2'])
    const f2 = family('f2', 'R', 'S2', ['K3'])

    const graph = new FamilyGraph([
      person('R', {families: [f1, f2]}),
      person('S1', {families: [f1]}),
      person('S2', {families: [f2]}),
      person('K1', {parentFamily: f1}),
      person('K2', {parentFamily: f1}),
      person('K3', {parentFamily: f2}),
    ])

    const tree = getFamilyTree(graph, 'R', 2)

    expect(tree.families).toHaveLength(2)

    expect(tree.families[0].partnerHandle).toBe('S1')
    expect(tree.families[0].children.map(child => child.handle)).toEqual([
      'K1',
      'K2',
    ])

    expect(tree.families[1].partnerHandle).toBe('S2')
    expect(tree.families[1].children.map(child => child.handle)).toEqual(['K3'])
  })

  it('supports a family with an unknown partner', () => {
    const f1 = family('f1', 'R', '', ['K1'])

    const graph = new FamilyGraph([
      person('R', {families: [f1]}),
      person('K1', {parentFamily: f1}),
    ])

    const tree = getFamilyTree(graph, 'R', 2)

    expect(tree.families[0].partnerHandle).toBe('')
    expect(tree.families[0].partner).toBeUndefined()
    expect(tree.families[0].children[0].handle).toBe('K1')
  })

  it('continues through descendant families to the requested depth', () => {
    const f1 = family('f1', 'R', 'S', ['K'])
    const f2 = family('f2', 'K', 'KS', ['G'])

    const graph = new FamilyGraph([
      person('R', {families: [f1]}),
      person('S', {families: [f1]}),
      person('K', {parentFamily: f1, families: [f2]}),
      person('KS', {families: [f2]}),
      person('G', {parentFamily: f2}),
    ])

    const tree = getFamilyTree(graph, 'R', 3)
    const child = tree.families[0].children[0]

    expect(child.handle).toBe('K')
    expect(child.families).toHaveLength(1)
    expect(child.families[0].partnerHandle).toBe('KS')
    expect(child.families[0].children[0].handle).toBe('G')
  })

  it('stops expanding descendant families at the requested depth', () => {
    const f1 = family('f1', 'R', 'S', ['K'])
    const f2 = family('f2', 'K', 'KS', ['G'])

    const graph = new FamilyGraph([
      person('R', {families: [f1]}),
      person('S', {families: [f1]}),
      person('K', {parentFamily: f1, families: [f2]}),
      person('KS', {families: [f2]}),
      person('G', {parentFamily: f2}),
    ])

    const tree = getFamilyTree(graph, 'R', 1)

    expect(tree.families).toHaveLength(1)
    expect(tree.families[0].children[0].handle).toBe('K')
    expect(tree.families[0].children[0].families).toEqual([])
  })

  it('keeps the handle when a referenced person was not fetched', () => {
    const f1 = family('f1', 'R', 'S', ['K'])
    const graph = new FamilyGraph([person('R', {families: [f1]})])

    const tree = getFamilyTree(graph, 'R', 2)

    expect(tree.families[0].partnerHandle).toBe('S')
    expect(tree.families[0].partner).toBeUndefined()
    expect(tree.families[0].children[0].handle).toBe('K')
    expect(tree.families[0].children[0].person).toBeUndefined()
  })

  it('never turns biological or adoptive parent families into partnerships', () => {
    const biological = family('FB', 'BF', 'FL', ['K'])
    const adoptive = family('FA', 'CH', 'FW', ['K'])
    const graph = new FamilyGraph([
      person('FL', {families: [biological]}),
      person('K', {
        parentFamily: biological,
        parentFamilies: [biological, adoptive],
        // Defend against a malformed or over-extended family list.
        families: [adoptive],
      }),
      person('BF'),
      person('CH'),
      person('FW'),
    ])

    const florenceTree = getFamilyTree(graph, 'FL', 1)
    const kennethTree = getFamilyTree(graph, 'K', 1)

    expect(florenceTree.families).toHaveLength(1)
    expect(florenceTree.families[0].partnerHandle).toBe('BF')
    expect(
      florenceTree.families[0].children.map(child => child.handle)
    ).toEqual(['K'])
    expect(kennethTree.families).toEqual([])
    expect(kennethTree.hasHiddenParents).toBe(true)
  })

  it('marks known parent families as hidden ancestry', () => {
    const fParents = family('fParents', 'F', 'M', ['R'])

    const graph = new FamilyGraph([
      person('R', {parentFamily: fParents}),
      person('F', {families: [fParents]}),
      person('M', {families: [fParents]}),
    ])

    const tree = getFamilyTree(graph, 'R', 1)

    expect(tree.hasHiddenParents).toBe(true)
  })

  it('does not mark ancestry when no parent family is known', () => {
    const graph = new FamilyGraph([person('R')])

    const tree = getFamilyTree(graph, 'R', 1)

    expect(tree.hasHiddenParents).toBe(false)
  })

  it('marks descendant families hidden by the depth limit', () => {
    const f1 = family('f1', 'R', 'S', ['K'])
    const f2 = family('f2', 'K', 'KS', ['G'])

    const graph = new FamilyGraph([
      person('R', {families: [f1]}),
      person('S', {families: [f1]}),
      person('K', {parentFamily: f1, families: [f2]}),
      person('KS', {families: [f2]}),
      person('G', {parentFamily: f2}),
    ])

    const tree = getFamilyTree(graph, 'R', 1)
    const child = tree.families[0].children[0]

    expect(tree.hasHiddenFamilies).toBe(false)
    expect(child.hasHiddenFamilies).toBe(true)
    expect(child.hiddenDescendantFamilyHandles).toEqual(['f2'])
  })
})

describe('getPrimaryAncestry', () => {
  it('builds the primary ancestry recursively', () => {
    const grandparents = family('FGP', 'GF', 'GM', ['F'])
    const parents = family('FP', 'F', 'M', ['R'])

    const graph = new FamilyGraph([
      person('R', {parentFamily: parents}),
      person('F', {parentFamily: grandparents}),
      person('M'),
      person('GF'),
      person('GM'),
    ])

    const result = getPrimaryAncestry(graph, 'R', 2)

    expect(result.handle).toBe('R')
    expect(result.parentFamily.father.handle).toBe('F')
    expect(result.parentFamily.mother.handle).toBe('M')
    expect(result.parentFamily.father.parentFamily.father.handle).toBe('GF')
    expect(result.parentFamily.father.parentFamily.mother.handle).toBe('GM')
  })

  it('stops expanding ancestry at the requested depth', () => {
    const grandparents = family('FGP', 'GF', 'GM', ['F'])
    const parents = family('FP', 'F', 'M', ['R'])

    const graph = new FamilyGraph([
      person('R', {parentFamily: parents}),
      person('F', {parentFamily: grandparents}),
      person('M'),
      person('GF'),
      person('GM'),
    ])

    const result = getPrimaryAncestry(graph, 'R', 1)
    const father = result.parentFamily.father

    expect(father.handle).toBe('F')
    expect(father.parentFamily).toBeUndefined()
    expect(father.hasHiddenPrimaryParents).toBe(true)
    expect(father.hiddenAncestorFamilyHandles).toEqual(['FGP'])
  })

  it("keeps Philip Anthony Levi's explicit Unknown mother resolved", () => {
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

    const result = getPrimaryAncestry(graph, 'PHILIP', 1)

    expect(result.parentFamily.family.handle).toBe('F500040')
    expect(result.parentFamily.father).toBeUndefined()
    expect(result.parentFamily.mother.handle).toBe('BLANK')
    expect(result.parentFamily.mother.person).toBe(blankMother)
    expect(result.parentFamily.mother.person.profile.sex).toBe('F')
  })

  it('records additional parent families without expanding them', () => {
    const birth = family('FB', 'F', 'M', ['R'])
    const adoptive = family('FA', 'AF', 'AM', ['R'])

    const graph = new FamilyGraph([
      {
        ...person('R', {parentFamily: birth}),
        extended: {
          primary_parent_family: birth,
          parent_families: [adoptive, birth],
          families: [],
        },
      },
      person('F'),
      person('M'),
      person('AF'),
      person('AM'),
    ])

    const result = getPrimaryAncestry(graph, 'R', 2)

    expect(result.parentFamily.family).toBe(birth)
    expect(result.hasAdditionalParentFamilies).toBe(true)
  })

  it('supports a missing parent in the primary family', () => {
    const parents = family('FP', 'F', '', ['R'])

    const graph = new FamilyGraph([
      person('R', {parentFamily: parents}),
      person('F'),
    ])

    const result = getPrimaryAncestry(graph, 'R', 2)

    expect(result.parentFamily.father.handle).toBe('F')
    expect(result.parentFamily.mother).toBeUndefined()
  })

  it("keeps an ancestor's additional partnerships without expanding them", () => {
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

    const result = getPrimaryAncestry(graph, 'V', 2)
    const gunter = result.parentFamily.father

    expect(gunter.handle).toBe('G')
    expect(gunter.sideFamilies.map(item => item.family.handle)).toEqual([
      'FG1',
      'FG2',
    ])
    expect(gunter.sideFamilies.map(item => item.partnerHandle)).toEqual([
      'P1',
      'P2',
    ])
    expect(gunter.sideFamilies.every(item => item.children.length === 0)).toBe(
      true
    )
    expect(gunter.sideFamilies[0].partner).toBe(graph.person('P1'))
    expect(gunter.sideFamilies[0]).not.toHaveProperty('parentFamily')
  })
})
