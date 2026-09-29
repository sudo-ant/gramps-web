import {getFamilyTree, getPrimaryAncestry} from '../model/familyTree.js'

export const familyTreeLayoutDefaults = {
  boxWidth: 190,
  boxHeight: 90,
  sexStripExtent: 4,
  partnerGap: 24,
  generationGap: 50,
  siblingGap: 24,
  familyGap: 32,
  partnershipLaneGap: 6,
  continuationExtent: 26,
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
    if (Number.isFinite(relationship.childX)) {
      relationship.childX += x
    }
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

const personNode = (data, level, x, key = data.key) => {
  const continuation = (direction, familyHandles) => ({
    key: `${key}:continuation:${direction}`,
    personHandle: data.handle,
    direction,
    familyHandles,
  })
  const ancestorFamilies = data.hiddenAncestorFamilyHandles ?? []
  const descendantFamilies = data.hiddenDescendantFamilyHandles ?? []

  return {
    key,
    handle: data.handle,
    person: data.person,
    level,
    x,
    y: 0,
    continuations: [
      ...(ancestorFamilies.length
        ? [continuation('ancestors', ancestorFamilies)]
        : []),
      ...(descendantFamilies.length
        ? [continuation('descendants', descendantFamilies)]
        : []),
    ],
    hasHiddenAncestors: ancestorFamilies.length > 0,
    hasHiddenDescendants: descendantFamilies.length > 0,
  }
}

const coupleStep = settings =>
  settings.boxWidth + settings.sexStripExtent + settings.partnerGap

const recordedSex = person => person?.profile?.sex

// Keep the API/family order unless the pair is explicitly recorded M/F.
const partnerDirection = (person, partner, fallback = 1) => {
  const personSex = recordedSex(person)
  const partnerSex = recordedSex(partner)
  if (personSex === 'M' && partnerSex === 'F') {
    return 1
  }
  if (personSex === 'F' && partnerSex === 'M') {
    return -1
  }
  return fallback
}

const familyDirection = (family, sharedHandle) =>
  family.father_handle === sharedHandle
    ? 1
    : family.mother_handle === sharedHandle
    ? -1
    : 1

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

// Partner cards occupy compact, deterministic positions independently of the
// width of their descendant subtrees. The child blocks are then packed on the
// appropriate side without stretching the partnership itself.
const placeRelationshipCentres = (items, data, settings, includeUnresolved) => {
  const {boxWidth, sexStripExtent, familyGap} = settings
  const step = coupleStep(settings)
  const placed = new Map()
  const previousPartnerX = new Map([
    [-1, 0],
    [1, 0],
  ])
  let primaryDirection

  items.forEach((item, index) => {
    const hasPartner = Boolean(
      item.family.partnerHandle && (item.family.partner || includeUnresolved)
    )
    const fallback = familyDirection(item.family.family, data.handle)
    const preferredDirection = hasPartner
      ? partnerDirection(data.person, item.family.partner, fallback)
      : fallback
    if (hasPartner && primaryDirection === undefined) {
      primaryDirection = preferredDirection
    }
    const direction =
      hasPartner && item.childBlock.nodes.length === 0 && index > 0
        ? -(primaryDirection ?? preferredDirection)
        : preferredDirection
    if (hasPartner) {
      const previous = previousPartnerX.get(direction)
      const distance = previous
        ? Math.abs(previous) + boxWidth + sexStripExtent + familyGap
        : step
      item.partnerX = direction * distance
      previousPartnerX.set(direction, item.partnerX)
      item.x = item.partnerX / 2
    } else {
      item.x = 0
    }
    item.coupleLane = index

    const preferredChildX = hasPartner && index > 0 ? item.partnerX : item.x
    const collision =
      direction < 0
        ? requiredLeftPosition(placed, item.childBlock.contours, familyGap)
        : requiredRightPosition(placed, item.childBlock.contours, familyGap)
    item.childX = Number.isFinite(collision)
      ? direction < 0
        ? Math.min(preferredChildX, collision)
        : Math.max(preferredChildX, collision)
      : preferredChildX
    translatedInto(placed, item.childBlock, item.childX)
  })
}

// Descendant blocks are measured from their person at x=0. Child blocks are
// centred on their relationship and retain those coordinates when emitted.
const measureDescendants = (data, settings, includeUnresolved) => {
  if (!data.person && !includeUnresolved) {
    return combineBlocks([])
  }
  const {siblingGap} = settings
  const node = personNode(data, 0, 0)
  const nodes = [node]
  const relationships = []
  const links = []
  const contours = new Map([[0, cardInterval(0, settings)]])
  const familyItems = data.families.map(family => {
    const childBlock = packBlocks(
      family.children
        .map(child => measureDescendants(child, settings, includeUnresolved))
        .filter(block => block.nodes.length),
      siblingGap
    )
    const item = {
      family,
      childBlock,
      x: 0,
    }
    return item
  })

  placeRelationshipCentres(familyItems, data, settings, includeUnresolved)

  familyItems.forEach(item => {
    const {family, childBlock, childX, coupleLane, partnerX, x} = item
    const partner =
      family.partnerHandle && (family.partner || includeUnresolved)
        ? personNode(family, 0, partnerX, `${family.key}:partner`)
        : undefined
    if (partner) {
      partner.handle = family.partnerHandle
      partner.person = family.partner
      nodes.push(partner)
      mergeInterval(contours, 0, cardInterval(partner.x, settings))
    }

    const relationship = {
      key: family.key,
      family: family.family,
      person: node,
      partner,
      x,
      childX,
      y: 0,
      level: 0,
      coupleX: x,
      coupleLane,
      coupleRoute: [],
      hasKnownPartner: Boolean(partner),
    }
    relationships.push(relationship)

    if (childBlock.nodes.length) {
      translateBlock(childBlock, childX, 1)
      nodes.push(...childBlock.nodes)
      relationships.push(...childBlock.relationships)
      links.push(...childBlock.links)
      mergeContours(contours, childBlock.contours)

      family.children.forEach(child => {
        const target = childBlock.nodes.find(
          childNode => childNode.key === child.key && childNode.level === 1
        )
        if (!target) {
          return
        }
        links.push({
          key: `${family.key}:child:${child.key}`,
          source: coupleLane === 0 ? relationship : partner ?? relationship,
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
  settings,
  includeUnresolved
) => {
  const step = coupleStep(settings)
  const counts = new Map([
    [-1, 0],
    [1, 0],
  ])
  data.sideFamilies.forEach((family, index) => {
    // Side partners stay outside the primary ancestor couple. Placing them
    // between that couple would put the primary family's child connector
    // behind the wrong partner card.
    const side = direction
    const count = counts.get(side) + 1
    counts.set(side, count)
    const partnerX = side * step * count
    const partner =
      family.partnerHandle && (family.partner || includeUnresolved)
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
      x: partner ? partnerX / 2 : root.x,
      y: 0,
      level: 0,
      ancestry: true,
      coupleX: partner ? partnerX / 2 : root.x,
      coupleLane: index + 1,
      coupleRoute: [],
      sidePartnership: true,
    })
  })
}

const ancestryPerson = (
  data,
  root,
  settings,
  sideDirection = 0,
  includeUnresolved = false
) => {
  const contours = new Map([[0, cardInterval(0, settings)]])
  const block = {nodes: [root], relationships: [], links: [], contours}
  if (sideDirection && data?.sideFamilies?.length) {
    addAncestorSidePartnerships(
      block,
      data,
      root,
      sideDirection,
      settings,
      includeUnresolved
    )
  }
  if (!data?.parentFamily) {
    return block
  }

  const {parentFamily} = data
  const makeParent = (parentData, role) => {
    if (!parentData || (!parentData.person && !includeUnresolved)) {
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
      role === 'father' ? -1 : 1,
      includeUnresolved
    )
  }
  const fatherBlock = makeParent(parentFamily.father, 'father')
  const motherBlock = makeParent(parentFamily.mother, 'mother')
  if (!fatherBlock && !motherBlock) {
    return block
  }
  const step = coupleStep(settings)

  if (fatherBlock && motherBlock) {
    const fatherData = parentFamily.father
    const motherData = parentFamily.mother
    const maleFemaleReversed =
      recordedSex(fatherData.person) === 'F' &&
      recordedSex(motherData.person) === 'M'
    const leftBlock = maleFemaleReversed ? motherBlock : fatherBlock
    const rightBlock = maleFemaleReversed ? fatherBlock : motherBlock
    const separation = Math.max(
      step,
      ancestrySeparation(leftBlock, rightBlock, settings)
    )
    translateBlock(leftBlock, -separation / 2, 1)
    translateBlock(rightBlock, separation / 2, 1)
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
    coupleLane: father && mother ? 0 : 1,
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

const layoutAncestry = (ancestry, rootNode, settings, includeUnresolved) => {
  const block = ancestryPerson(
    ancestry,
    rootNode,
    settings,
    0,
    includeUnresolved
  )
  return {
    nodes: block.nodes.filter(node => node !== rootNode),
    relationships: block.relationships,
    links: block.links,
  }
}

const setVerticalPositions = (layout, settings) => {
  const {
    boxWidth,
    boxHeight,
    sexStripExtent,
    generationGap,
    partnershipLaneGap,
  } = settings
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
        Math.max(lanes.get(relationship.level) ?? 0, relationship.coupleLane)
      )
    })
  const descendantY = new Map([[0, 0]])
  for (let level = 0; level < maxDescendantLevel; level += 1) {
    const extra =
      Math.max(0, (lanes.get(level) ?? 0) - 2) * partnershipLaneGap * 2
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
    relationship.y = rowY - relationship.coupleLane * partnershipLaneGap
    // A later family's trunk leaves its partner branch so it cannot be read
    // as belonging to the shared person's primary partnership.
    const usePartnerOrigin =
      !relationship.ancestry &&
      relationship.coupleLane > 0 &&
      relationship.partner
    const oneParentFamily = !relationship.partner
    relationship.descendantOrigin = usePartnerOrigin
      ? {
          x: relationship.partner.x,
          y: relationship.partner.y + boxHeight / 2,
        }
      : oneParentFamily
      ? {
          x: relationship.person.x,
          y: relationship.person.y + boxHeight / 2,
        }
      : {x: relationship.x, y: relationship.y}
    relationship.descendantOriginType = usePartnerOrigin
      ? 'partner'
      : oneParentFamily
      ? 'person'
      : 'relationship'
    if (!relationship.coupleLane || oneParentFamily) {
      relationship.coupleRoute = []
      return
    }
    const cardEdge = (person, targetX) =>
      targetX < person.x
        ? person.x - boxWidth / 2 - sexStripExtent
        : person.x + boxWidth / 2
    relationship.coupleRoute = [
      [
        {
          x: cardEdge(relationship.person, relationship.partner.x),
          y: relationship.y,
        },
        {
          x: cardEdge(relationship.partner, relationship.person.x),
          y: relationship.y,
        },
      ],
    ]
  })
}

const compactPoints = points =>
  points.filter(
    (point, index) =>
      index === 0 ||
      point.x !== points[index - 1].x ||
      point.y !== points[index - 1].y
  )

const setLinkRoutes = (layout, settings) => {
  const {boxHeight} = settings
  const byRelationship = new Map()
  layout.links.forEach(treeLink => {
    const links = byRelationship.get(treeLink.relationship) ?? []
    links.push(treeLink)
    byRelationship.set(treeLink.relationship, links)
  })
  byRelationship.forEach(links => {
    const source = links[0].relationship
    const origin = source.descendantOrigin ?? {x: source.x, y: source.y}
    const targets = links.map(treeLink => ({
      x: treeLink.target.x,
      y: treeLink.target.y - boxHeight / 2,
    }))
    const needsBus = links.length > 1 || targets[0].x !== origin.x
    const parentBottom =
      Math.max(
        ...[source.person, source.partner]
          .filter(Boolean)
          .map(person => person.y)
      ) +
      boxHeight / 2
    const connectorStart = Math.max(origin.y, parentBottom)
    const busY = needsBus
      ? connectorStart + (targets[0].y - connectorStart) / 2
      : undefined

    links.forEach((treeLink, index) => {
      const target = targets[index]
      treeLink.points = compactPoints(
        needsBus
          ? [origin, {x: origin.x, y: busY}, {x: target.x, y: busY}, target]
          : [origin, target]
      )
    })
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
  const {boxWidth, boxHeight, sexStripExtent, continuationExtent, padding} =
    settings
  const points = []
  layout.nodes.forEach(node => {
    points.push(
      {x: node.x - boxWidth / 2 - sexStripExtent, y: node.y - boxHeight / 2},
      {x: node.x + boxWidth / 2, y: node.y + boxHeight / 2}
    )
    node.continuations.forEach(continuation => {
      const direction = continuation.direction === 'ancestors' ? -1 : 1
      points.push({
        x: node.x,
        y: node.y + direction * (boxHeight / 2 + continuationExtent),
      })
    })
  })
  layout.relationships.forEach(relationship => {
    points.push({x: relationship.x - 3, y: relationship.y - 3})
    points.push({x: relationship.x + 3, y: relationship.y + 3})
    relationship.coupleRoute.forEach(route => points.push(...route))
  })
  layout.links.forEach(treeLink => points.push(...treeLink.points))
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
  {
    ancestorDepth = 0,
    descendantDepth = 1,
    includeUnresolved = false,
    ...options
  } = {}
) {
  const settings = {...familyTreeLayoutDefaults, ...options}
  const data = getFamilyTree(graph, handle, descendantDepth)
  const ancestry = getPrimaryAncestry(graph, handle, ancestorDepth)
  const descendants = measureDescendants(data, settings, includeUnresolved)
  const rootNode = descendants.nodes.find(node => node.level === 0)
  rootNode.hasHiddenAncestors = ancestry.hasHiddenPrimaryParents
  if (ancestry.hiddenAncestorFamilyHandles?.length) {
    rootNode.continuations.push({
      key: `${rootNode.key}:continuation:ancestors`,
      personHandle: rootNode.handle,
      direction: 'ancestors',
      familyHandles: ancestry.hiddenAncestorFamilyHandles,
    })
  }
  const ancestors = layoutAncestry(
    ancestry,
    rootNode,
    settings,
    includeUnresolved
  )
  markAncestry(ancestors)
  const layout = {
    nodes: [...descendants.nodes, ...ancestors.nodes],
    relationships: [...descendants.relationships, ...ancestors.relationships],
    links: [...descendants.links, ...ancestors.links],
  }
  setVerticalPositions(layout, settings)
  setLinkRoutes(layout, settings)
  return withBounds(layout, settings)
}
