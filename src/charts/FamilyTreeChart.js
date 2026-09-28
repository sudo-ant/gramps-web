import {curveBumpY, link} from 'd3-shape'
import {ChartCanvas, place} from './ChartCanvas.js'
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
        .map(
          (point, index) =>
            `${index === 0 ? 'M' : 'L'}${point.x - relationship.x},${
              point.y - relationship.y
            }`
        )
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
    return [place(treeLink.relationship), place(treeLink.target)]
  }

  linkPath([source, target]) {
    const inset = boxHeight / 2 - 10
    const direction = Math.sign(target[1] - source[1])

    return link(curveBumpY)({
      source,
      target: [target[0], target[1] - direction * inset],
    })
  }

  styleLinks(links, palette) {
    this._links.attr('stroke-opacity', 0.4)

    links.attr('stroke', palette.link)
  }

  drawExtras(nodes, {palette}) {
    const relationships = nodes.filter(node => node.isRelationship)

    relationships
      .selectAll('circle.relationship-junction')
      .data(node => [node])
      .join('circle')
      .attr('class', 'relationship-junction')
      .attr('r', 3)
      .attr('fill', palette.link)

    relationships
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
      .attr('class', 'relationship-couple')
      .attr('x1', item => item.x1)
      .attr('x2', item => item.x2)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', palette.link)
      .attr('stroke-opacity', 0.4)

    relationships
      .selectAll('path.relationship-couple-route')
      .data(node => (node.coupleRoute.length ? [node] : []))
      .join('path')
      .attr('class', 'relationship-couple relationship-couple-route')
      .attr('d', node => routePath(node.coupleRoute, node))
      .attr('fill', 'none')
      .attr('stroke', palette.link)
      .attr('stroke-opacity', 0.4)
  }
}
