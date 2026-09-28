import {curveBumpY, link} from 'd3-shape'
import {ChartCanvas, place} from './ChartCanvas.js'
import {familyTreeLayoutDefaults} from './layout/familyTreeLayout.js'

const {boxWidth, boxHeight} = familyTreeLayoutDefaults

const relationshipNode = relationship => ({
  ...relationship,
  key: `relationship:${relationship.key}`,
  isRelationship: true,
})

const relationshipKey = relationship => `relationship:${relationship.key}`

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
    this._root = layout.nodes.find(node => node.generation === 0)

    this._relationshipNodes = new Map(
      layout.relationships.map(relationship => [
        relationship,
        relationshipNode(relationship),
      ])
    )

    this._keys = new Map()

    layout.nodes.forEach(node => {
      this._keys.set(node, `person:${node.key}`)
    })

    this._relationshipNodes.forEach((node, relationship) => {
      this._keys.set(node, relationshipKey(relationship))
    })

    return {
      bounds: layout.bounds,
      rootHandle: this._root?.handle,
      candidates: [],
    }
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
    const relationship = this._relationshipNodes.get(treeLink.relationship)

    return [place(relationship), place(treeLink.target)]
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
        if (!node.person || !node.partner) {
          return []
        }

        const personDirection = Math.sign(node.person.x - node.x)
        const partnerDirection = Math.sign(node.partner.x - node.x)

        return [
          {
            x1: node.person.x - node.x - (personDirection * boxWidth) / 2,
            x2: node.partner.x - node.x - (partnerDirection * boxWidth) / 2,
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
  }
}
