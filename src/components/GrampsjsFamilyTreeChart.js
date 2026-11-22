import {html} from 'lit'

import {FamilyTreeChart} from '../charts/FamilyTreeChart.js'
import {layoutFamilyTree} from '../charts/layout/familyTreeLayout.js'
import {chartTransitionDuration, getImageUrl} from '../charts/util.js'
import {GrampsjsChartBase} from './GrampsjsChartBase.js'

const layoutProperties = ['data', 'grampsId', 'nAnc', 'nDesc']

const personName = person =>
  person?.profile?.name_display ||
  [person?.profile?.name_given, person?.profile?.name_surname]
    .filter(Boolean)
    .join(' ') ||
  person?.gramps_id ||
  person?.handle ||
  ''

export class GrampsjsFamilyTreeChart extends GrampsjsChartBase {
  static get properties() {
    return {
      grampsId: {type: String},
      nAnc: {type: Number},
      nDesc: {type: Number},
      nameDisplayFormat: {type: String},
      canEdit: {type: Boolean},
    }
  }

  constructor() {
    super()
    this.grampsId = ''
    this.nAnc = 4
    this.nDesc = 1
    this._chart = new FamilyTreeChart()
    this._layout = null
  }

  render() {
    return html`<div id="container"></div>`
  }

  firstUpdated() {
    super.firstUpdated()
    this.renderRoot.getElementById('container').append(this._chart.node)
  }

  willUpdate(changed) {
    super.willUpdate(changed)
    if (!layoutProperties.some(name => changed.has(name))) {
      return
    }
    // Keep the current chart while a newly selected person is being fetched.
    // A data update that still omits them confirms there is no layout.
    const layout = this._computeLayout()
    if (layout || changed.has('data')) {
      this._layout = layout
    }
  }

  updated() {
    this._drawChart()
  }

  _computeLayout() {
    const {handle} = this._graph.personByGrampsId(this.grampsId) ?? {}
    if (!handle) {
      return null
    }
    return layoutFamilyTree(this._graph, handle, {
      ancestorDepth: this.nAnc,
      descendantDepth: this.nDesc,
    })
  }

  _drawChart() {
    if (!this._layout) {
      this._chart.clear()
      return
    }
    this._chart.update(this._layout, {
      getImageUrl: d => getImageUrl(d.person ?? {}, 100),
      showImagePlaceholder: true,
      unknownName: this._('Unknown'),
      relationshipTypeLabel: type => this._(type),
      relationshipLabel: link =>
        `${personName(link.target.person)}: ${link.parents
          .map(
            ({handle, role, type}) =>
              `${this._(role === 'father' ? 'Father' : 'Mother')} ${personName(
                this._graph.person(handle)
              )}: ${this._(type)}`
          )
          .join(' / ')}`,
      bboxWidth: this.containerWidth,
      bboxHeight: this.containerHeight,
      nameDisplayFormat: this.nameDisplayFormat,
      canEdit: this.canEdit,
      duration: chartTransitionDuration(),
    })
  }
}

window.customElements.define(
  'grampsjs-family-tree-chart',
  GrampsjsFamilyTreeChart
)
