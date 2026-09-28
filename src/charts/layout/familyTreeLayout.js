import {getFamilyTree, getPrimaryAncestry} from '../model/familyTree.js'

export const familyTreeLayoutDefaults = {
  boxWidth: 190,
  boxHeight: 90,
  sexStripExtent: 4,
  partnerGap: 24,
  generationGap: 50,
  siblingGap: 24,
  familyGap: 32,
  connectorLaneGap: 12,
  padding: 20,
}

const mergeInterval = (contours, level, interval) => {
  const current = contours.get(level)
  contours.set(
    level,
    current
      ? {
          min: Math.min(current.min, interval.min),
          max: Math.max(current.max, interval.max),
        }
      : {...interval}
  )
}

const mergeContours = (target, source) => {
  source.forEach((interval, level) => mergeInterval(target, level, interval))
  return target
}

const shiftedContours = (contours, x = 0, levelOffset = 0) => {
  const shifted = new Map()
  contours.forEach((interval, level) => {
    shifted.set(level + levelOffset, {
      min: interval.min + x,
      max: interval.max + x,
    })
  })
  return shifted
}

const contourExtent = contours => {
  let min = Infinity
  let max = -Infinity
  contours.forEach(interval => {
    min = Math.min(min, interval.min)
    max = Math.max(max, interval.max)
  })
  return {min, max}
}

const requiredShift = (placed, contours, gap) => {
  let shift = -Infinity
  contours.forEach((interval, level) => {
    const occupied = placed.get(level)
    if (occupied) {
      shift = Math.max(shift, occupied.max + gap - interval.min)
    }
  })
  return shift
}

// A measured block owns relative card coordinates and an occupied interval
// for every generation. Translating it keeps both representations in sync.
const translateBlock = (block, x, levelOffset = 0) => {
  block.nodes.forEach(node => {
    node.x += x
    node.level += levelOffset
  })
  block.relationships.forEach(relationship => {
    relationship.x += x
    relationship.coupleX += x
    relationship.level += levelOffset
  })
  block.contours = shiftedContours(block.contours, x, levelOffset)
  return block
}

const combineBlocks = blocks => ({
  nodes: blocks.flatMap(block => block.nodes),
  relationships: blocks.flatMap(block => block.relationships),
  links: blocks.flatMap(block => block.links),
  contours: blocks.reduce(
    (contours, block) => mergeContours(contours, block.contours),
    new Map()
  ),
})

const packBlocks = (blocks, gap) => {
  if (blocks.length === 0) {
    return combineBlocks([])
  }

  const placedContours = new Map()
  blocks.forEach((block, index) => {
    const shift =
      index === 0 ? 0 : requiredShift(placedContours, block.contours, gap)
    translateBlock(block, shift)
    mergeContours(placedContours, block.contours)
  })

  const rootPositions = blocks.flatMap(block =>
    block.nodes.filter(node => node.level === 0).map(node => node.x)
  )
  const centre =
    rootPositions.length > 0
      ? (Math.min(...rootPositions) + Math.max(...rootPositions)) / 2
      : (() => {
          const {min, max} = contourExtent(placedContours)
          return (min + max) / 2
        })()
  blocks.forEach(block => translateBlock(block, -centre))
  return combineBlocks(blocks)
}

const requiredRightPosition = (placed, contours, gap) => {
  const position = requiredShift(placed, contours, gap)
  return Number.isFinite(position) ? position : -Infinity
}

const requiredLeftPosition = (placed, contours, gap) => {
  let position = Infinity
  contours.forEach((interval, level) => {
    const occupied = placed.get(level)
    if (occupied) {
      position = Math.min(position, occupied.min - gap - interval.max)
    }
  })
  return position
}

const translatedInto = (target, block, x) =>
  mergeContours(target, shiftedContours(block.contours, x))

const cardInterval = (x, {boxWidth, sexStripExtent}) => ({
  min: x - boxWidth / 2 - sexStripExtent,
  max: x + boxWidth / 2,
})

const personNode = (data, level, x, key = data.key) => ({
  key,
  handle: data.handle,
  person: data.person,
  level,
  x,
  y: 0,
})

const coupleStep = settings =>
  settings.boxWidth + settings.sexStripExtent + settings.partnerGap

const childSeparation = (left, right, gap) =>
  Math.max(0, requiredRightPosition(left.contours, right.contours, gap))

const ancestrySeparation = (left, right, settings) => {
  let separation = 0
  right.contours.forEach((interval, level) => {
    const occupied = left.contours.get(level)
    if (occupied) {
      const gap = level === 0 ? settings.partnerGap : settings.familyGap
      separation = Math.max(separation, occupied.max + gap - interval.min)
    }
  })
  return separation
}

// Relationship centres are solved first. A partner is always reflected across
// its relationship centre from the shared person at x=0.
const placeRelationshipCentres = (items, settings) => {
  const {familyGap} = settings
  const step = coupleStep(settings)
  const halfStep = step / 2
  const known = items.filter(item => item.family.partnerHandle)
  const unknown = items.filter(item => !item.family.partnerHandle)
  const placed = new Map()

  if (known.length === 1) {
    known[0].x = halfStep
    translatedInto(placed, known[0].childBlock, known[0].x)
  } else if (known.length >= 2) {
    const separation = Math.max(
      step,
      childSeparation(known[0].childBlock, known[1].childBlock, familyGap)
    )
    known[0].x = -separation / 2
    known[1].x = separation / 2
    translatedInto(placed, known[0].childBlock, known[0].x)
    translatedInto(placed, known[1].childBlock, known[1].x)

    let left = known[0]
    let right = known[1]
    known.slice(2).forEach((item, index) => {
      if (index % 2 === 0) {
        const collision = requiredLeftPosition(
          placed,
          item.childBlock.contours,
          familyGap
        )
        item.x = Math.min(
          left.x - halfStep,
          Number.isFinite(collision) ? collision : Infinity
        )
        left = item
      } else {
        const collision = requiredRightPosition(
          placed,
          item.childBlock.contours,
          familyGap
        )
        item.x = Math.max(
          right.x + halfStep,
          Number.isFinite(collision) ? collision : -Infinity
        )
        right = item
      }
      translatedInto(placed, item.childBlock, item.x)
    })
  }

  unknown.forEach((item, index) => {
    if (known.length === 0 && index === 0) {
      item.x = 0
    } else if (index % 2 === 0) {
      const collision = requiredLeftPosition(
        placed,
        item.childBlock.contours,
        familyGap
      )
      item.x = Number.isFinite(collision) ? collision : -familyGap
    } else {
      const collision = requiredRightPosition(
        placed,
        item.childBlock.contours,
        familyGap
      )
      item.x = Number.isFinite(collision) ? collision : familyGap
    }
    translatedInto(placed, item.childBlock, item.x)
  })
}

// Descendant blocks are measured from their person at x=0. Child blocks are
// centred on their relationship and retain those coordinates when emitted.
const measureDescendants = (data, settings) => {
  const {siblingGap} = settings
  const node = personNode(data, 0, 0)
  const nodes = [node]
  const relationships = []
  const links = []
  const contours = new Map([[0, cardInterval(0, settings)]])
  let knownPartnerIndex = 0
  const familyItems = data.families.map((family, index) => {
    const childBlock = packBlocks(
      family.children.map(child => measureDescendants(child, settings)),
      siblingGap
    )
    const item = {
      index,
      family,
      childBlock,
      knownPartnerIndex: family.partnerHandle ? knownPartnerIndex : undefined,
      x: 0,
    }
    if (family.partnerHandle) {
      knownPartnerIndex += 1
    }
    return item
  })

  placeRelationshipCentres(familyItems, settings)

  let routeLane = 0
  familyItems.forEach(item => {
    const {family, childBlock, knownPartnerIndex: partnerIndex, x} = item
    const partner = family.partnerHandle
      ? personNode(family, 0, 2 * x, `${family.key}:partner`)
      : undefined
    if (partner) {
      partner.handle = family.partnerHandle
      partner.person = family.partner
      nodes.push(partner)
      mergeInterval(contours, 0, cardInterval(partner.x, settings))
    }

    const routed = !partner || partnerIndex >= 2
    if (routed) {
      routeLane += 1
    }
    const relationship = {
      key: family.key,
      family: family.family,
      person: node,
      partner,
      x,
      y: 0,
      level: 0,
      coupleX: x,
      routeLane: routed ? routeLane : 0,
      coupleRoute: [],
    }
    relationships.push(relationship)

    if (childBlock.nodes.length) {
      translateBlock(childBlock, x, 1)
      nodes.push(...childBlock.nodes)
      relationships.push(...childBlock.relationships)
      links.push(...childBlock.links)
      mergeContours(contours, childBlock.contours)

      family.children.forEach(child => {
        const target = childBlock.nodes.find(
          childNode => childNode.key === child.key && childNode.level === 1
        )
        links.push({
          key: `${family.key}:child:${child.key}`,
          source: relationship,
          target,
          relationship,
        })
      })
    }
  })

  return {nodes, relationships, links, contours}
}

const addAncestorSidePartnerships = (
  block,
  data,
  root,
  direction,
  settings
) => {
  const step = coupleStep(settings)
  data.sideFamilies.forEach((family, index) => {
    const partnerX = direction * step * (index + 1)
    const partner = family.partnerHandle
      ? personNode(family, 0, partnerX, `${family.key}:partner`)
      : undefined
    if (partner) {
      partner.handle = family.partnerHandle
      partner.person = family.partner
      partner.ancestry = true
      block.nodes.push(partner)
      mergeInterval(block.contours, 0, cardInterval(partner.x, settings))
    }

    block.relationships.push({
      key: family.key,
      family: family.family,
      person: root,
      partner,
      x: partner ? partnerX / 2 : direction * (step / 2) * (index + 1),
      y: 0,
      level: 0,
      ancestry: true,
      coupleX: partner ? partnerX / 2 : root.x,
      routeLane: partner && index === 0 ? 0 : Math.max(1, index),
      coupleRoute: [],
      sidePartnership: true,
    })
  })
}

const ancestryPerson = (data, root, settings, sideDirection = 0) => {
  const contours = new Map([[0, cardInterval(0, settings)]])
  const block = {nodes: [root], relationships: [], links: [], contours}
  if (sideDirection && data?.sideFamilies?.length) {
    addAncestorSidePartnerships(block, data, root, sideDirection, settings)
  }
  if (!data?.parentFamily) {
    return block
  }

  const {parentFamily} = data
  const makeParent = (parentData, role) => {
    if (!parentData) {
      return undefined
    }
    const parent = personNode(
      parentData,
      0,
      0,
      `${parentFamily.family.handle}:${role}:${parentData.handle}`
    )
    parent.ancestry = true
    return ancestryPerson(
      parentData,
      parent,
      settings,
      role === 'father' ? -1 : 1
    )
  }
  const fatherBlock = makeParent(parentFamily.father, 'father')
  const motherBlock = makeParent(parentFamily.mother, 'mother')
  if (!fatherBlock && !motherBlock) {
    return block
  }
  const step = coupleStep(settings)

  if (fatherBlock && motherBlock) {
    const separation = Math.max(
      step,
      ancestrySeparation(fatherBlock, motherBlock, settings)
    )
    translateBlock(fatherBlock, -separation / 2, 1)
    translateBlock(motherBlock, separation / 2, 1)
  } else if (fatherBlock || motherBlock) {
    translateBlock(fatherBlock ?? motherBlock, 0, 1)
  }

  const parentBlocks = [fatherBlock, motherBlock].filter(Boolean)
  const father = fatherBlock?.nodes[0]
  const mother = motherBlock?.nodes[0]
  const relationship = {
    key: `${parentFamily.family.handle}:ancestry`,
    family: parentFamily.family,
    person: father ?? mother,
    partner: father && mother ? mother : undefined,
    x: 0,
    y: 0,
    level: 1,
    ancestry: true,
    coupleX: 0,
    routeLane: father && mother ? 0 : 1,
    coupleRoute: [],
  }
  block.relationships.push(relationship)
  block.links.push({
    key: `${parentFamily.family.handle}:child:${root.handle}:ancestry`,
    source: relationship,
    target: root,
    relationship,
  })
  parentBlocks.forEach(parentBlock => {
    block.nodes.push(...parentBlock.nodes)
    block.relationships.push(...parentBlock.relationships)
    block.links.push(...parentBlock.links)
    mergeContours(block.contours, parentBlock.contours)
  })
  return block
}

const layoutAncestry = (ancestry, rootNode, settings) => {
  const block = ancestryPerson(ancestry, rootNode, settings)
  return {
    nodes: block.nodes.filter(node => node !== rootNode),
    relationships: block.relationships,
    links: block.links,
  }
}

const setVerticalPositions = (layout, settings) => {
  const {boxHeight, generationGap, connectorLaneGap} = settings
  const maxDescendantLevel = Math.max(
    0,
    ...layout.nodes.filter(node => !node.ancestry).map(node => node.level)
  )
  const lanes = new Map()
  layout.relationships
    .filter(relationship => !relationship.ancestry)
    .forEach(relationship => {
      lanes.set(
        relationship.level,
        Math.max(lanes.get(relationship.level) ?? 0, relationship.routeLane)
      )
    })
  const descendantY = new Map([[0, 0]])
  for (let level = 0; level < maxDescendantLevel; level += 1) {
    const extra = Math.max(0, (lanes.get(level) ?? 0) - 2) * connectorLaneGap
    descendantY.set(
      level + 1,
      descendantY.get(level) + boxHeight + generationGap + extra
    )
  }

  layout.nodes.forEach(node => {
    node.generation = node.ancestry ? node.level : node.level ? -node.level : 0
    node.y = node.ancestry
      ? -node.level * (boxHeight + generationGap)
      : descendantY.get(node.level)
  })
  layout.relationships.forEach(relationship => {
    const rowY = relationship.ancestry
      ? -relationship.level * (boxHeight + generationGap)
      : descendantY.get(relationship.level)
    relationship.y = relationship.routeLane
      ? rowY + boxHeight / 2 + relationship.routeLane * connectorLaneGap
      : rowY
    if (!relationship.routeLane) {
      return
    }
    const cardBottom = rowY + boxHeight / 2
    relationship.coupleRoute = [relationship.person, relationship.partner]
      .filter(Boolean)
      .map(person => [
        {x: person.x, y: cardBottom},
        {x: person.x, y: relationship.y},
        {x: relationship.x, y: relationship.y},
      ])
  })
}

const markAncestry = ancestryLayout => {
  ancestryLayout.nodes.forEach(node => {
    node.ancestry = true
  })
  ancestryLayout.relationships.forEach(relationship => {
    relationship.ancestry = true
  })
}

const withBounds = (layout, settings) => {
  const {boxWidth, boxHeight, sexStripExtent, padding} = settings
  const points = []
  layout.nodes.forEach(node => {
    points.push(
      {x: node.x - boxWidth / 2 - sexStripExtent, y: node.y - boxHeight / 2},
      {x: node.x + boxWidth / 2, y: node.y + boxHeight / 2}
    )
  })
  layout.relationships.forEach(relationship => {
    points.push({x: relationship.x - 3, y: relationship.y - 3})
    points.push({x: relationship.x + 3, y: relationship.y + 3})
    relationship.coupleRoute.forEach(route => points.push(...route))
  })
  if (points.length === 0) {
    return {...layout, bounds: {xMin: 0, xMax: 0, yMin: 0, yMax: 0}}
  }
  return {
    ...layout,
    bounds: {
      xMin: Math.min(...points.map(point => point.x)) - padding,
      xMax: Math.max(...points.map(point => point.x)) + padding,
      yMin: Math.min(...points.map(point => point.y)) - padding,
      yMax: Math.max(...points.map(point => point.y)) + padding,
    },
  }
}

export function layoutFamilyTree(
  graph,
  handle,
  {ancestorDepth = 0, descendantDepth = 1, ...options} = {}
) {
  const settings = {...familyTreeLayoutDefaults, ...options}
  const data = getFamilyTree(graph, handle, descendantDepth)
  const ancestry = getPrimaryAncestry(graph, handle, ancestorDepth)
  const descendants = measureDescendants(data, settings)
  const rootNode = descendants.nodes.find(node => node.level === 0)
  const ancestors = layoutAncestry(ancestry, rootNode, settings)
  markAncestry(ancestors)
  const layout = {
    nodes: [...descendants.nodes, ...ancestors.nodes],
    relationships: [...descendants.relationships, ...ancestors.relationships],
    links: [...descendants.links, ...ancestors.links],
  }
  setVerticalPositions(layout, settings)
  return withBounds(layout, settings)
}
