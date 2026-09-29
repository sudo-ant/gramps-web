import {mdiFamilyTree} from '@mdi/js'
import {ChartCanvas, place} from './ChartCanvas.js'
import {translate} from './animatedJoin.js'
import {familyTreeLayoutDefaults} from './layout/familyTreeLayout.js'

const {boxWidth, boxHeight, sexStripExtent} = familyTreeLayoutDefaults

const relationshipNode = relationship => ({
  ...relationship,
  key: `relationship:${relationship.key}`,
  isRelationship: true,
})

const relationshipKey = relationship => `relationship:${relationship.key}`

const personJoinKeys = layout => {
  const occurrences = new Map()
  return new Map(
    layout.nodes.map(node => {
      if (!node.handle) {
        return [node, `person:key:${node.key}`]
      }
      const occurrence = occurrences.get(node.handle) ?? 0
      occurrences.set(node.handle, occurrence + 1)
      return [node, `person:${node.handle}:${occurrence}`]
    })
  )
}

const assignKey = (keys, node, key) => {
  const previousKey = keys.get(node)
  for (const [other, otherKey] of keys) {
    if (otherKey === key) {
      keys.set(other, previousKey)
    }
  }
  keys.set(node, key)
}

const routePath = (routes, relationship) =>
  routes
    .map(route =>
      route
        .map((point, index) => {
          const x = point.x - relationship.x
          const y = point.y - relationship.y
          if (index === 0) {
            return `M${x},${y}`
          }
          return point.x === route[index - 1].x ? `V${y}` : `H${x}`
        })
        .join('')
    )
    .join('')

export class FamilyTreeChart extends ChartCanvas {
  constructor() {
    super()
    this._keys = new Map()
    this._root = undefined
    this._relationshipNodes = new Map()
  }

  get boxSize() {
    return {boxWidth, boxHeight}
  }

  get nodeClass() {
    return 'family-tree-node'
  }

  prepare(layout) {
    const previousKeys = this._keys
    this._root = layout.nodes.find(node => node.generation === 0)

    this._relationshipNodes = new Map(
      layout.relationships.map(relationship => [
        relationship,
        relationshipNode(relationship),
      ])
    )

    this._keys = personJoinKeys(layout)

    this._relationshipNodes.forEach((node, relationship) => {
      this._keys.set(node, relationshipKey(relationship))
    })

    return {
      bounds: layout.bounds,
      rootHandle: this._root?.handle,
      candidates: [...previousKeys]
        .filter(
          ([node]) => !node.isRelationship && node.handle === this._root.handle
        )
        .map(([, key]) => ({key, position: [0, 0]})),
    }
  }

  keepInPlace(key) {
    assignKey(this._keys, this._root, key)
  }

  drawnNodes(layout) {
    return [
      ...layout.nodes,
      ...layout.relationships.map(relationship =>
        this._relationshipNodes.get(relationship)
      ),
    ]
  }

  isPerson(node) {
    return !node.isRelationship
  }

  nodeKey(node) {
    return this._keys.get(node)
  }

  linkKey(treeLink) {
    return treeLink.key
  }

  enterNode(enter) {
    const node = enter.append('g').attr('class', 'family-tree-node')

    node
      .filter(item => !item.isRelationship)
      .append('g')
      .attr('class', 'person-card')

    return node
  }

  isRootPerson(node) {
    return !node.isRelationship && node.generation === 0
  }

  linkEnds(treeLink) {
    return [place(treeLink.points[0]), place(treeLink.points.at(-1))]
  }

  linkPath([source, target], treeLink) {
    if (source[0] === target[0]) {
      return `M${source[0]},${source[1]}V${target[1]}`
    }
    const points = treeLink.points
    const first = points[0]
    const last = points.at(-1)
    const busRatio = (points[1].y - first.y) / (last.y - first.y)
    const busY = source[1] + busRatio * (target[1] - source[1])
    return `M${source[0]},${source[1]}V${busY}H${target[0]}V${target[1]}`
  }

  styleLinks(links, palette) {
    this._links.attr('stroke-opacity', 0.4)

    links
      .attr('stroke', palette.link)
      .classed('descendant-connector', true)
      .classed(
        'primary-family-descendant',
        link => link.relationship.ancestry || link.relationship.coupleLane === 0
      )
      .classed(
        'subsequent-family-descendant',
        link => !link.relationship.ancestry && link.relationship.coupleLane > 0
      )
  }

  drawExtras(nodes, {palette}) {
    const relationships = nodes.filter(node => node.isRelationship)
    const people = nodes.filter(node => !node.isRelationship)
    const relationshipData = relationships.nodes().map(node => node.__data__)
    const partnershipGroups = this._links
      .selectAll('g.partnership-relationship')
      .data(relationshipData, node => node.key)
      .join('g')
      .attr('class', 'partnership-relationship')
      .classed('primary-partnership', node => node.coupleLane === 0)
      .classed('secondary-partnership', node => node.coupleLane > 0)
      .attr('transform', node => translate([node.x, node.y]))

    partnershipGroups
      .selectAll('circle.relationship-junction')
      .data(node => (node.partner ? [node] : []))
      .join('circle')
      .attr('class', 'relationship-junction')
      .attr('r', 3)
      .attr('fill', palette.link)

    partnershipGroups
      .selectAll('line.relationship-couple')
      .data(node => {
        if (!node.person || !node.partner || node.coupleRoute.length) {
          return []
        }

        const personDirection = Math.sign(node.person.x - node.x)
        const partnerDirection = Math.sign(node.partner.x - node.x)
        const edge = (person, direction) =>
          person.x -
          node.x -
          (direction > 0 ? boxWidth / 2 + sexStripExtent : -boxWidth / 2)

        return [
          {
            x1: edge(node.person, personDirection),
            x2: edge(node.partner, partnerDirection),
          },
        ]
      })
      .join('line')
      .attr('class', 'relationship-couple partnership-connector')
      .attr('x1', item => item.x1)
      .attr('x2', item => item.x2)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', palette.link)
      .attr('stroke-opacity', 0.4)

    const drawContinuation = (className, directionName, direction) => {
      const marker = people
        .selectAll(`g.${className}`)
        .data(
          node =>
            node.continuations?.filter(
              continuation => continuation.direction === directionName
            ) ?? [],
          continuation => continuation.key
        )
        .join('g')
        .attr('class', `family-tree-continuation ${className}`)
        .attr('transform', `translate(0,${direction * (boxHeight / 2)})`)
        .attr('data-person-handle', continuation => continuation.personHandle)
        .attr('data-direction', continuation => continuation.direction)
        .attr('data-family-handles', continuation =>
          continuation.familyHandles.join(',')
        )
        .attr('aria-hidden', 'true')
        .attr('pointer-events', 'none')

      marker
        .selectAll('line.family-tree-continuation-stem')
        .data(continuation => [continuation])
        .join('line')
        .attr('class', 'family-tree-continuation-stem')
        .attr('x1', 0)
        .attr('x2', 0)
        .attr('y1', 0)
        .attr('y2', direction * 8)
        .attr('stroke', palette.link)
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round')

      marker
        .selectAll('path.family-tree-continuation-icon')
        .data(continuation => [continuation])
        .join('path')
        .attr('class', 'family-tree-continuation-icon')
        .attr('d', mdiFamilyTree)
        .attr(
          'transform',
          direction < 0
            ? 'translate(-9,-26) scale(0.75) rotate(180 12 12)'
            : 'translate(-9,8) scale(0.75)'
        )
        .attr('fill', palette.link)
        .attr('fill-opacity', 0.8)
    }

    drawContinuation('family-tree-continuation-ancestors', 'ancestors', -1)
    drawContinuation('family-tree-continuation-descendants', 'descendants', 1)

    partnershipGroups
      .selectAll('path.relationship-couple-route')
      .data(node => (node.coupleRoute.length ? [node] : []))
      .join('path')
      .attr(
        'class',
        'relationship-couple relationship-couple-route partnership-connector'
      )
      .attr('d', node => routePath(node.coupleRoute, node))
      .attr('fill', 'none')
      .attr('stroke', palette.link)
      .attr('stroke-opacity', 0.4)

    relationships
      .selectAll(
        '.relationship-junction, .relationship-couple, .relationship-couple-route'
      )
      .remove()
  }
}
