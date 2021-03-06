import algolia from 'algoliasearch/lite';
import algoliaHelper from 'algoliasearch-helper';
import escapeHtml from 'escape-html';

var version = "1.3.0";

var serialize = function(helper) {
  if (!(helper instanceof algoliaHelper.AlgoliaSearchHelper)) {
    throw new TypeError('Serialize expects an algolia helper instance.');
  }

  var client = helper.getClient();

  var response = helper.lastResults ? helper.lastResults._rawResults : null;

  var serialized = {
    searchParameters: Object.assign({}, helper.state),
    appId: client.applicationID,
    apiKey: client.apiKey,
    response: response,
  };

  return serialized;
};

var deserialize = function(data) {
  var client = algolia(data.appId, data.apiKey);
  var helper = algoliaHelper(
    client,
    data.searchParameters.index,
    data.searchParameters
  );

  if (data.response) {
    helper.lastResults = new algoliaHelper.SearchResults(
      helper.state,
      data.response
    );
  }

  return helper;
};

var sanitizeResults = function(
  results,
  safePreTag,
  safePostTag,
  preTag,
  postTag
) {
  if ( preTag === void 0 ) preTag = '<em>';
  if ( postTag === void 0 ) postTag = '</em>';

  if (!Array.isArray(results)) {
    throw new TypeError('Results should be provided as an array.');
  }

  if (typeof safePreTag !== 'string' || typeof safePostTag !== 'string') {
    throw new TypeError(
      'safePreTag and safePostTag should be provided as strings.'
    );
  }

  var sanitized = [];
  for (var i = 0, list = results; i < list.length; i += 1) {
    var result = list[i];

    if ('_highlightResult' in result) {
      result._highlightResult = sanitizeHighlights(
        result._highlightResult,
        safePreTag,
        safePostTag,
        preTag,
        postTag
      );
    }

    if ('_snippetResult' in result) {
      result._snippetResult = sanitizeHighlights(
        result._snippetResult,
        safePreTag,
        safePostTag,
        preTag,
        postTag
      );
    }

    sanitized.push(result);
  }

  return sanitized;
};

var sanitizeHighlights = function(
  data,
  safePreTag,
  safePostTag,
  preTag,
  postTag
) {
  if (containsValue(data)) {
    var sanitized = Object.assign({}, data, {
      value: escapeHtml(data.value)
        .replace(new RegExp(safePreTag, 'g'), preTag)
        .replace(new RegExp(safePostTag, 'g'), postTag),
    });

    return sanitized;
  }

  if (Array.isArray(data)) {
    var child = [];
    data.forEach(function (item) {
      child.push(
        sanitizeHighlights(item, safePreTag, safePostTag, preTag, postTag)
      );
    });

    return child;
  }

  if (isObject(data)) {
    var keys = Object.keys(data);
    var child$1 = {};
    keys.forEach(function (key) {
      child$1[key] = sanitizeHighlights(
        data[key],
        safePreTag,
        safePostTag,
        preTag,
        postTag
      );
    });

    return child$1;
  }

  return data;
};

var containsValue = function(data) {
  return isObject(data) && 'matchLevel' in data && 'value' in data;
};

var isObject = function (value) { return typeof value === 'object' && value !== null; };

var FACET_AND = 'and';
var FACET_OR = 'or';
var FACET_TREE = 'tree';

var HIGHLIGHT_PRE_TAG = '__ais-highlight__';
var HIGHLIGHT_POST_TAG = '__/ais-highlight__';

var createFromAlgoliaCredentials = function (appID, apiKey) {
  var client = algolia(appID, apiKey);
  var helper = algoliaHelper(client);

  return new Store(helper);
};

var createFromAlgoliaClient = function (client) {
  var helper = algoliaHelper(client);

  return new Store(helper);
};

var createFromSerialized = function (data) {
  var helper = deserialize(data.helper);

  var store = new Store(helper);
  store.highlightPreTag = data.highlightPreTag;
  store.highlightPostTag = data.highlightPostTag;

  return store;
};

var Store = function Store(helper) {
  if (!(helper instanceof algoliaHelper.AlgoliaSearchHelper)) {
    throw new TypeError(
      'Store should be constructed with an AlgoliaSearchHelper instance as first parameter.'
    );
  }
  // We require one start() call to execute the first search query.
  // Allows every widget to alter the state at initialization
  // without trigger multiple queries.
  this._stoppedCounter = 1;

  this._highlightPreTag = '<em>';
  this._highlightPostTag = '</em>';

  this._cacheEnabled = true;

  this.algoliaHelper = helper;
};

var prototypeAccessors = { algoliaHelper: {},highlightPreTag: {},highlightPostTag: {},algoliaClient: {},algoliaApiKey: {},algoliaAppId: {},indexName: {},resultsPerPage: {},results: {},page: {},totalPages: {},totalResults: {},processingTimeMS: {},maxValuesPerFacet: {},activeRefinements: {},query: {},queryParameters: {} };

prototypeAccessors.algoliaHelper.set = function (helper) {
  if (this._helper) {
    this._helper.removeListener('change', onHelperChange);
    this._helper.removeListener('result', onHelperResult);
  }

  this._helper = helper;

  // Here we enforce custom highlight tags for handling XSS protection.
  // We also make sure that we keep the current page as setQueryParameter resets it.
  var page = this._helper.getPage();
  this._helper.setQueryParameter('highlightPreTag', HIGHLIGHT_PRE_TAG);
  this._helper.setQueryParameter('highlightPostTag', HIGHLIGHT_POST_TAG);
  this._helper.setPage(page);

  if (this._helper.lastResults) {
    onHelperResult.apply(this, [this._helper.lastResults]);
  } else {
    this._results = [];
  }

  this._helper.on('change', onHelperChange.bind(this));
  this._helper.on('result', onHelperResult.bind(this));

  this._helper.getClient().addAlgoliaAgent(("vue-instantsearch " + version));
};

prototypeAccessors.algoliaHelper.get = function () {
  return this._helper;
};

prototypeAccessors.highlightPreTag.get = function () {
  return this._highlightPreTag;
};

prototypeAccessors.highlightPreTag.set = function (tag) {
  this._highlightPreTag = tag;
};

prototypeAccessors.highlightPostTag.get = function () {
  return this._highlightPostTag;
};

prototypeAccessors.highlightPostTag.set = function (tag) {
  this._highlightPostTag = tag;
};

prototypeAccessors.algoliaClient.set = function (algoliaClient) {
  this._helper.setClient(algoliaClient);

  // Manually trigger the change given the helper doesn't emit a change event
  // when a new client is set.
  onHelperChange();
};

prototypeAccessors.algoliaClient.get = function () {
  return this._helper.getClient();
};

prototypeAccessors.algoliaApiKey.get = function () {
  return this.algoliaClient.apiKey;
};

prototypeAccessors.algoliaAppId.get = function () {
  return this.algoliaClient.applicationID;
};

Store.prototype.start = function start () {
  if (this._stoppedCounter < 1) {
    this._stoppedCounter = 0;
  } else {
    this._stoppedCounter--;
  }
};

Store.prototype.stop = function stop () {
  this._stoppedCounter++;
};

prototypeAccessors.indexName.set = function (index) {
  this._helper.setIndex(index);
};

prototypeAccessors.indexName.get = function () {
  return this._helper.getIndex();
};

prototypeAccessors.resultsPerPage.set = function (count) {
  this._helper.setQueryParameter('hitsPerPage', count);
};

prototypeAccessors.resultsPerPage.get = function () {
  var resultsPerPage = this._helper.getQueryParameter('hitsPerPage');

  if (resultsPerPage) {
    return resultsPerPage;
  }

  return this._helper.lastResults ? this._helper.lastResults.hitsPerPage : 0;
};

prototypeAccessors.results.get = function () {
  return this._results;
};

prototypeAccessors.page.get = function () {
  return this._helper.getPage() + 1;
};

prototypeAccessors.page.set = function (page) {
  this._helper.setPage(page - 1);
};

prototypeAccessors.totalPages.get = function () {
  if (!this._helper.lastResults) {
    return 0;
  }

  return this._helper.lastResults.nbPages;
};

prototypeAccessors.totalResults.get = function () {
  if (!this._helper.lastResults) {
    return 0;
  }

  return this._helper.lastResults.nbHits;
};

prototypeAccessors.processingTimeMS.get = function () {
  if (!this._helper.lastResults) {
    return 0;
  }

  return this._helper.lastResults.processingTimeMS;
};

prototypeAccessors.maxValuesPerFacet.set = function (limit) {
  var currentMaxValuesPerFacet = this._helper.state.maxValuesPerFacet || 0;
  this._helper.setQueryParameter(
    'maxValuesPerFacet',
    Math.max(currentMaxValuesPerFacet, limit)
  );
};

Store.prototype.addFacet = function addFacet (attribute, type) {
    if ( type === void 0 ) type = FACET_AND;

  if (this.hasFacet(attribute, type)) {
    return;
  }

  this.stop();

  var state = null;
  if (type === FACET_AND) {
    if (!this._helper.state.isConjunctiveFacet(attribute)) {
      this.removeFacet(attribute);
      state = this._helper.state.addFacet(attribute);
    }
  } else if (type === FACET_OR) {
    if (!this._helper.state.isDisjunctiveFacet(attribute)) {
      this.removeFacet(attribute);
      state = this._helper.state.addDisjunctiveFacet(attribute);
    }
  } else if (type === FACET_TREE) {
    if (!this._helper.state.isHierarchicalFacet(attribute.name)) {
      this.removeFacet(attribute.name);
      state = this._helper.state.addHierarchicalFacet(attribute);
    }
  }

  if (state !== null) {
    this._helper.setState(state);
  }
  this.start();
  this.refresh();
};

Store.prototype.removeFacet = function removeFacet (attribute) {
  var state = null;

  if (this._helper.state.isConjunctiveFacet(attribute)) {
    state = this._helper.state.removeFacet(attribute);
  } else if (this._helper.state.isDisjunctiveFacet(attribute)) {
    state = this._helper.state.removeDisjunctiveFacet(attribute);
  } else if (this._helper.state.isHierarchicalFacet(attribute)) {
    state = this._helper.state.removeHierarchicalFacet(attribute);
  } else {
    return;
  }

  this._helper.setState(state);
};

Store.prototype.hasFacet = function hasFacet (attribute, type) {
    if ( type === void 0 ) type = FACET_AND;

  assertValidFacetType(type);

  switch (type) {
    case FACET_AND:
      return this._helper.state.isConjunctiveFacet(attribute);
    case FACET_OR:
      return this._helper.state.isDisjunctiveFacet(attribute);
    case FACET_TREE:
      return this._helper.state.isHierarchicalFacet(attribute);
    default:
      throw new TypeError((type + " could not be handled."));
  }
};

Store.prototype.addFacetRefinement = function addFacetRefinement (attribute, value) {
  if (this._helper.state.isConjunctiveFacet(attribute)) {
    this._helper.addFacetRefinement(attribute, value);
  } else if (this._helper.state.isDisjunctiveFacet(attribute)) {
    this._helper.addDisjunctiveFacetRefinement(attribute, value);
  } else if (this._helper.state.isHierarchicalFacet(attribute)) {
    this._helper.addHierarchicalFacetRefinement(attribute, value);
  }
};

Store.prototype.toggleFacetRefinement = function toggleFacetRefinement (facet, value) {
  this._helper.toggleRefinement(facet, value);
};

Store.prototype.clearRefinements = function clearRefinements (attribute) {
  this._helper.clearRefinements(attribute);
};

Store.prototype.getFacetValues = function getFacetValues (attribute, sortBy, limit) {
    if ( limit === void 0 ) limit = -1;

  if (!this._helper.lastResults) {
    return [];
  }

  var values;
  try {
    values = this._helper.lastResults.getFacetValues(attribute, {
      sortBy: sortBy,
    });
  } catch (e) {
    values = [];
  }

  if (limit === -1) {
    return values;
  }

  return values.slice(0, limit);
};

Store.prototype.getFacetStats = function getFacetStats (attribute) {
  if (!this._helper.lastResults) {
    return {};
  }

  return this._helper.lastResults.getFacetStats(attribute) || {};
};

prototypeAccessors.activeRefinements.get = function () {
  if (!this._helper.lastResults) {
    return [];
  }

  return this._helper.lastResults.getRefinements();
};

Store.prototype.addNumericRefinement = function addNumericRefinement (attribute, operator, value) {
  this._helper.addNumericRefinement(attribute, operator, value);
};

Store.prototype.removeNumericRefinement = function removeNumericRefinement (attribute, operator, value) {
  this._helper.removeNumericRefinement(attribute, operator, value);
};

prototypeAccessors.query.set = function (query) {
  if (this._helper.state.query === query) {
    return;
  }
  this._helper.setQuery(query);
};

prototypeAccessors.query.get = function () {
  return this._helper.state.query;
};

prototypeAccessors.queryParameters.get = function () {
  return Object.assign({}, this._helper.state, {
    page: this.page,
    highlightPreTag: this.highlightPreTag,
    highlightPostTag: this.highlightPostTag,
  });
};

prototypeAccessors.queryParameters.set = function (searchParameters) {
  var params = Object.assign({}, searchParameters);
  var paramKeys = Object.keys(params);
  paramKeys.forEach(function (key) {
    if (params[key] === null) {
      params[key] = undefined;
    }
  });

  if (params.page !== undefined) {
    params.page = params.page - 1;
  }

  if ('highlightPreTag' in params) {
    this.highlightPreTag = params.highlightPreTag;
    delete params.highlightPreTag;
  }

  if ('highlightPostTag' in params) {
    this.highlightPostTag = params.highlightPostTag;
    delete params.highlightPostTag;
  }

  var newSearchParameters = algoliaHelper.SearchParameters.make(
    Object.assign({}, this._helper.state, params)
  );
  this._helper.setState(newSearchParameters);
};

Store.prototype.serialize = function serialize$$1 () {
  return {
    helper: serialize(this._helper),
    highlightPreTag: this.highlightPreTag,
    highlightPostTag: this.highlightPostTag,
  };
};

Store.prototype.refresh = function refresh () {
  if (this._stoppedCounter !== 0) {
    return;
  }
  if (this._cacheEnabled === false) {
    this.clearCache();
  }
  this._helper.search();
};

Store.prototype.enableCache = function enableCache () {
  this._cacheEnabled = true;
};

Store.prototype.disableCache = function disableCache () {
  this._cacheEnabled = false;
};

Store.prototype.clearCache = function clearCache () {
  this.algoliaClient.clearCache();
};

Store.prototype.waitUntilInSync = function waitUntilInSync () {
    var this$1 = this;

  return new Promise(function (resolve, reject) {
    if (this$1._helper.hasPendingRequests() === false) {
      resolve();
      return;
    }

    var resolvePromise = function () {
      this$1._helper.removeListener('error', rejectPromise);
      resolve();
    };

    var rejectPromise = function (error) {
      this$1._helper.removeListener('searchQueueEmpty', resolvePromise);
      reject(error);
    };

    this$1._helper.once('searchQueueEmpty', resolvePromise);
    this$1._helper.once('error', rejectPromise);
  });
};

Object.defineProperties( Store.prototype, prototypeAccessors );

var assertValidFacetType = function(type) {
  if (type === FACET_AND) { return; }
  if (type === FACET_OR) { return; }
  if (type === FACET_TREE) { return; }

  throw new Error(("Invalid facet type " + type + "."));
};

var onHelperChange = function() {
  this.refresh();
};

var onHelperResult = function(response) {
  this._results = sanitizeResults(
    response.hits,
    HIGHLIGHT_PRE_TAG,
    HIGHLIGHT_POST_TAG,
    this.highlightPreTag,
    this.highlightPostTag
  );
};

var algoliaComponent = {
  inject: ['_searchStore'],
  props: {
    searchStore: {
      type: Object,
      default: function default$1$$1() {
        if (typeof this._searchStore !== 'object') {
          var tag = this.$options._componentTag;
          throw new TypeError(
            ("It looks like you forgot to wrap your Algolia search component \n            \"<" + tag + ">\" inside of an \"<ais-index>\" component. You can also pass a \n            search store as a prop to your component.")
          );
        }
        return this._searchStore;
      },
    },
    classNames: {
      type: Object,
      default: function default$2$$1() {
        return {};
      },
    },
  },
  beforeCreate: function beforeCreate() {
    var source = this; // eslint-disable-line consistent-this
    var provideKey = '_searchStore';

    while (source) {
      if (source._provided && provideKey in source._provided) {
        break;
      }
      source = source.$parent;
    }

    if (!source) {
      if (!this._provided) {
        this._provided = {};
      }

      this._provided[provideKey] = undefined;
    }
  },
  methods: {
    bem: function bem(element, modifier, outputElement) {
      if (!this.blockClassName) {
        throw new Error("You need to provide 'blockClassName' in your data.");
      }

      var blockClassName = this.blockClassName;
      if (!element && !modifier) {
        return this.customClassName(blockClassName);
      }

      if (!element) {
        var blockModifierClassName = blockClassName + "--" + modifier;

        return this.customClassName(blockModifierClassName);
      }

      var elementClassName = blockClassName + "__" + element;
      if (!modifier) {
        return this.customClassName(elementClassName);
      }

      var elementModifierClassName = elementClassName + "--" + modifier;

      if (outputElement !== undefined && outputElement === false) {
        return this.customClassName(elementModifierClassName);
      }
      return ((this.customClassName(elementClassName)) + " " + (this.customClassName(
        elementModifierClassName
      )));
    },
    customClassName: function customClassName(className) {
      return !this.classNames[className]
        ? className
        : this.classNames[className];
    },
  },
};

var Index = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('div',{class:_vm.bem()},[_vm._t("default")],2)},staticRenderFns: [],
  mixins: [algoliaComponent],
  props: {
    searchStore: {
      type: Object,
      default: function default$1$$1() {
        return this._searchStore;
      },
    },
    apiKey: {
      type: String,
      default: function default$2$$1() {
        if (this._searchStore) {
          return this._searchStore.algoliaApiKey;
        }

        return undefined;
      },
    },
    appId: {
      type: String,
      default: function default$3() {
        if (this._searchStore) {
          return this._searchStore.algoliaAppId;
        }

        return undefined;
      },
    },
    indexName: {
      type: String,
      default: function default$4() {
        if (this._searchStore) {
          return this._searchStore.indexName;
        }

        return undefined;
      },
    },
    query: {
      type: String,
      default: '',
    },
    queryParameters: {
      type: Object,
    },
    cache: {
      type: Boolean,
      default: true,
    },
    autoSearch: {
      type: Boolean,
      default: true,
    },
  },
  data: function data() {
    return {
      blockClassName: 'ais-index',
    };
  },
  provide: function provide() {
    if (!this.searchStore) {
      this._localSearchStore = createFromAlgoliaCredentials(
        this.appId,
        this.apiKey
      );
    } else {
      this._localSearchStore = this.searchStore;
    }

    if (this.indexName) {
      this._localSearchStore.indexName = this.indexName;
    }

    if (this.query) {
      this._localSearchStore.query = this.query;
    }

    if (this.queryParameters) {
      this._localSearchStore.queryParameters = this.queryParameters;
    }

    if (this.cache) {
      this._localSearchStore.enableCache();
    } else {
      this._localSearchStore.disableCache();
    }

    return {
      _searchStore: this._localSearchStore,
    };
  },
  mounted: function mounted() {
    this._localSearchStore.start();
    if (this.autoSearch) {
      this._localSearchStore.refresh();
    }
  },
  watch: {
    indexName: function indexName() {
      this._localSearchStore.indexName = this.indexName;
    },
    query: function query() {
      this._localSearchStore.query = this.query;
    },
    queryParameters: function queryParameters() {
      this._localSearchStore.queryParameters = this.queryParameters;
    },
  },
};

var getPropertyByPath = function(object, path) {
  var parts = path.split('.');

  return parts.reduce(function (current, key) { return current && current[key]; }, object);
};

var Highlight = {
  functional: true,
  props: {
    result: {
      type: Object,
      required: true,
    },
    attributeName: {
      type: String,
      required: true,
    },
  },
  render: function render(h, ctx) {
    var result = ctx.props.result;
    var attributeName = ctx.props.attributeName;

    var attributePath = "_highlightResult." + attributeName + ".value";
    var attributeValue = getPropertyByPath(result, attributePath);

    if (process.env.NODE_ENV !== 'production' && attributeValue === undefined) {
      throw new Error(
        ("The \"" + attributeName + "\" attribute is currently not configured to be highlighted in Algolia.\n        See https://www.algolia.com/doc/api-reference/api-parameters/attributesToHighlight/.")
      );
    }

    return h('span', {
      class: {
        'ais-highlight': true,
      },
      domProps: {
        innerHTML: attributeValue,
      },
    });
  },
};

var Snippet = {
  functional: true,
  props: {
    result: {
      type: Object,
      required: true,
    },
    attributeName: {
      type: String,
      required: true,
    },
  },
  render: function render(h, ctx) {
    var result = ctx.props.result;
    var attributeName = ctx.props.attributeName;

    var attributePath = "_snippetResult." + attributeName + ".value";
    var attributeValue = getPropertyByPath(result, attributePath);

    if (process.env.NODE_ENV !== 'production' && attributeValue === undefined) {
      throw new Error(
        ("The \"" + attributeName + "\" attribute is currently not configured to be snippeted in Algolia.\n        See https://www.algolia.com/doc/api-reference/api-parameters/attributesToSnippet/.")
      );
    }

    return h('span', {
      class: {
        'ais-snippet': true,
      },
      domProps: {
        innerHTML: attributeValue,
      },
    });
  },
};

var AisInput = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('input',{directives:[{name:"model",rawName:"v-model",value:(_vm.query),expression:"query"}],class:_vm.bem(),attrs:{"type":"search","autocorrect":"off","autocapitalize":"off","autocomplete":"off","spellcheck":"false"},domProps:{"value":(_vm.query)},on:{"input":function($event){if($event.target.composing){ return; }_vm.query=$event.target.value;}}})},staticRenderFns: [],
  mixins: [algoliaComponent],
  data: function data() {
    return {
      blockClassName: 'ais-input',
    };
  },
  computed: {
    query: {
      get: function get() {
        return this.searchStore.query;
      },
      set: function set(value) {
        this.searchStore.stop();
        this.searchStore.query = value;
        this.$emit('query', value);

        // We here ensure we give the time to listeners to alter the store's state
        // without triggering in between ghost queries.
        this.$nextTick(function() {
          this.searchStore.start();
          this.searchStore.refresh();
        });
      },
    },
  },
};

var Results = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return (_vm.show)?_c('div',{class:_vm.bem()},[_vm._t("header"),_vm._v(" "),_vm._t("default",null,{results:_vm.results}),_vm._v(" "),_vm._t("footer")],2):_vm._e()},staticRenderFns: [],
  mixins: [algoliaComponent],
  props: {
    stack: {
      type: Boolean,
      default: false,
    },
    resultsPerPage: {
      type: Number,
    },
  },
  data: function data() {
    return {
      blockClassName: 'ais-results',
    };
  },
  created: function created() {
    this.updateResultsPerPage();
  },
  watch: {
    resultsPerPage: function resultsPerPage() {
      this.updateResultsPerPage();
    },
  },
  methods: {
    updateResultsPerPage: function updateResultsPerPage() {
      if (typeof this.resultsPerPage === 'number' && this.resultsPerPage > 0) {
        this.searchStore.resultsPerPage = this.resultsPerPage;
      }
    },
  },
  computed: {
    results: function results() {
      if (this.stack === false) {
        return this.searchStore.results;
      }

      if (typeof this.stackedResults === 'undefined') {
        this.stackedResults = [];
      }

      if (this.searchStore.page === 1) {
        this.stackedResults = [];
      }

      if (
        this.stackedResults.length === 0 ||
        this.searchStore.results.length === 0
      ) {
        (ref = this.stackedResults).push.apply(ref, this.searchStore.results);
      } else {
        var lastStacked = this.stackedResults[this.stackedResults.length - 1];
        var lastResult = this.searchStore.results[
          this.searchStore.results.length - 1
        ];

        if (lastStacked.objectID !== lastResult.objectID) {
          (ref$1 = this.stackedResults).push.apply(ref$1, this.searchStore.results);
        }
      }

      return this.stackedResults;
      var ref;
      var ref$1;
    },
    show: function show() {
      return this.results.length > 0;
    },
  },
};

var Stats = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return (_vm.totalResults > 0)?_c('div',{class:_vm.bem()},[_vm._t("default",[_vm._v(" "+_vm._s(_vm.totalResults.toLocaleString())+" results found in "+_vm._s(_vm.processingTime.toLocaleString())+"ms ")],{totalResults:_vm.totalResults,processingTime:_vm.processingTime,query:_vm.query})],2):_vm._e()},staticRenderFns: [],
  mixins: [algoliaComponent],
  data: function data() {
    return {
      blockClassName: 'ais-stats',
    };
  },
  computed: {
    query: function query() {
      return this.searchStore.query;
    },
    totalResults: function totalResults() {
      return this.searchStore.totalResults;
    },
    processingTime: function processingTime() {
      return this.searchStore.processingTimeMS;
    },
  },
};

var Pagination = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('ul',{directives:[{name:"show",rawName:"v-show",value:(_vm.totalResults > 0),expression:"totalResults > 0"}],class:_vm.bem()},[_c('li',{class:[_vm.bem('item', 'first'), _vm.page === 1 ? _vm.bem('item', 'disabled', false) : '']},[_c('a',{class:_vm.bem('link'),attrs:{"href":"#"},on:{"click":function($event){$event.preventDefault();_vm.goToFirstPage($event);}}},[_vm._t("first",[_vm._v("<<")])],2)]),_vm._v(" "),_c('li',{class:[_vm.bem('item', 'previous'), _vm.page === 1 ? _vm.bem('item', 'disabled', false) : '']},[_c('a',{class:_vm.bem('link'),attrs:{"href":"#"},on:{"click":function($event){$event.preventDefault();_vm.goToPreviousPage($event);}}},[_vm._t("previous",[_vm._v("<")])],2)]),_vm._v(" "),_vm._l((_vm.pages),function(item){return _c('li',{key:item,class:[_vm.bem('item'), _vm.page === item ? _vm.bem('item', 'active', false) : '']},[_c('a',{class:_vm.bem('link'),attrs:{"href":"#"},on:{"click":function($event){$event.preventDefault();_vm.goToPage(item);}}},[_vm._t("default",[_vm._v(" "+_vm._s(item)+" ")],{value:item,active:item === _vm.page})],2)])}),_vm._v(" "),_c('li',{class:[_vm.bem('item', 'next'), _vm.page >= _vm.totalPages ? _vm.bem('item', 'disabled', false) : '']},[_c('a',{class:_vm.bem('link'),attrs:{"href":"#"},on:{"click":function($event){$event.preventDefault();_vm.goToNextPage($event);}}},[_vm._t("next",[_vm._v(">")])],2)]),_vm._v(" "),_c('li',{class:[_vm.bem('item', 'last'), _vm.page >= _vm.totalPages ? _vm.bem('item', 'disabled', false) : '']},[_c('a',{class:_vm.bem('link'),attrs:{"href":"#"},on:{"click":function($event){$event.preventDefault();_vm.goToLastPage($event);}}},[_vm._t("last",[_vm._v(">>")])],2)])],2)},staticRenderFns: [],
  mixins: [algoliaComponent],
  props: {
    padding: {
      type: Number,
      default: 3,
      validator: function validator(value) {
        return value > 0;
      },
    },
  },
  data: function data() {
    return {
      blockClassName: 'ais-pagination',
    };
  },
  computed: {
    page: function page() {
      return this.searchStore.page;
    },
    totalPages: function totalPages() {
      return this.searchStore.totalPages;
    },
    pages: function pages() {
      var this$1 = this;

      var maxPages = this.padding * 2;
      if (this.totalPages - 1 < maxPages) {
        maxPages = this.totalPages - 1;
      }

      var pages = [this.page];
      var even = false;
      var lastPage = this.page;
      var firstPage = this.page;
      while (pages.length <= maxPages) {
        even = !even;
        if (even) {
          if (firstPage <= 1) {
            continue; // eslint-disable-line no-continue
          }
          firstPage--;
          pages.unshift(firstPage);
        } else {
          if (lastPage >= this$1.totalPages) {
            continue; // eslint-disable-line no-continue
          }
          lastPage++;
          pages.push(lastPage);
        }
      }

      return pages;
    },
    totalResults: function totalResults() {
      return this.searchStore.totalResults;
    },
  },
  methods: {
    goToPage: function goToPage(page) {
      var p = Math.max(1, page);
      p = Math.min(this.totalPages, p);
      if (this.searchStore.page === p) {
        return;
      }
      this.searchStore.page = p;
      this.$emit('page-change');
    },
    goToFirstPage: function goToFirstPage() {
      this.goToPage(1);
    },
    goToPreviousPage: function goToPreviousPage() {
      this.goToPage(this.page - 1);
    },
    goToNextPage: function goToNextPage() {
      this.goToPage(this.page + 1);
    },
    goToLastPage: function goToLastPage() {
      this.goToPage(this.totalPages);
    },
  },
};

var ResultsPerPageSelector = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('select',{directives:[{name:"model",rawName:"v-model",value:(_vm.resultsPerPage),expression:"resultsPerPage"}],class:_vm.bem(),on:{"change":function($event){var $$selectedVal = Array.prototype.filter.call($event.target.options,function(o){return o.selected}).map(function(o){var val = "_value" in o ? o._value : o.value;return val}); _vm.resultsPerPage=$event.target.multiple ? $$selectedVal : $$selectedVal[0];}}},[_vm._l((_vm.options),function(option){return [_c('option',{key:option,domProps:{"value":option}},[_vm._t("default",[_vm._v(_vm._s(option))],{option:option})],2)]})],2)},staticRenderFns: [],
  mixins: [algoliaComponent],
  props: {
    options: {
      type: Array,
      default: function default$1$$1() {
        return [6, 12, 24];
      },
    },
  },
  data: function data() {
    return {
      blockClassName: 'ais-results-per-page-selector',
    };
  },
  computed: {
    resultsPerPage: {
      get: function get() {
        return this.searchStore.resultsPerPage;
      },
      set: function set(value) {
        this.searchStore.resultsPerPage = Number(value);
      },
    },
  },
  created: function created() {
    if (this.options.indexOf(this.searchStore.resultsPerPage) === -1) {
      this.searchStore.resultsPerPage = this.options[0];
    }
  },
};

var TreeMenu = {
  mixins: [algoliaComponent],
  props: {
    attribute: {
      type: String,
      default: 'tree-menu',
    },
    attributes: {
      type: Array,
      required: true,
    },
    separator: {
      type: String,
      default: ' > ',
    },
    limit: {
      type: Number,
      default: 10,
    },
    sortBy: {
      default: function default$1$$1() {
        return ['name:asc'];
      },
    },
  },
  data: function data() {
    return {
      blockClassName: 'ais-tree-menu',
    };
  },
  created: function created() {
    this.searchStore.addFacet(
      {
        name: this.attribute,
        attributes: this.attributes,
        separator: this.separator,
      },
      FACET_TREE
    );
  },
  destroyed: function destroyed() {
    this.searchStore.removeFacet(this.attribute);
  },
  computed: {
    facetValues: function facetValues() {
      var values = this.searchStore.getFacetValues(
        this.attribute,
        this.sortBy
      );

      return values.data || [];
    },
    show: function show() {
      return this.facetValues.length > 0;
    },
  },
  methods: {
    toggleRefinement: function toggleRefinement(value) {
      return this.searchStore.toggleFacetRefinement(this.attribute, value.path);
    },
    _renderList: function _renderList(h, facetValues, isRoot) {
      var this$1 = this;
      if ( isRoot === void 0 ) isRoot = true;

      var listItems = [];
      var loop = function () {
        var facet = list[i];

        var listItemLabel = [];

        if (this$1.$scopedSlots.default) {
          listItemLabel.push(
            this$1.$scopedSlots.default({
              value: facet.name,
              count: facet.count,
              active: facet.isRefined,
            })
          );
        } else {
          listItemLabel.push(
            h(
              'span',
              {
                class: this$1.bem('value'),
              },
              facet.name
            ),
            h(
              'span',
              {
                class: this$1.bem('count'),
              },
              facet.count
            )
          );
        }

        var listItemChildren = [
          h(
            'a',
            {
              domProps: {
                href: '#',
              },
              on: {
                click: function (event) {
                  event.preventDefault();
                  this$1.toggleRefinement(facet);
                },
              },
            },
            listItemLabel
          ) ];

        if (facet.isRefined && facet.data && facet.data.length > 0) {
          listItemChildren.push(this$1._renderList(h, facet.data, false));
        }

        listItems.push(
          h(
            'li',
            {
              class: [
                this$1.bem('item'),
                facet.isRefined ? this$1.bem('item', 'active') : '' ],
            },
            listItemChildren
          )
        );
      };

      for (var i = 0, list = facetValues; i < list.length; i += 1) loop();

      return h(
        'ul',
        {
          class: isRoot ? this.bem('list') : '',
        },
        listItems
      );
    },
  },
  render: function render(h) {
    if (this.show === false) {
      return undefined;
    }

    var children = [];

    if (this.$slots.header) {
      children.push(this.$slots.header);
    }

    children.push(this._renderList(h, this.facetValues));

    if (this.$slots.footer) {
      children.push(this.$slots.footer);
    }

    return h(
      'div',
      {
        class: this.bem(),
      },
      children
    );
  },
};

var Menu = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return (_vm.show)?_c('div',{class:_vm.bem()},[_vm._t("header"),_vm._v(" "),_vm._l((_vm.facetValues),function(facet,key){return _c('div',{key:key,class:facet.isRefined ? _vm.bem('item', 'active') : _vm.bem('item')},[_c('a',{class:_vm.bem('link'),attrs:{"href":"#"},on:{"click":function($event){$event.preventDefault();_vm.handleClick(facet.path);}}},[_vm._v(" "+_vm._s(facet.name)+" "),_c('span',{class:_vm.bem('count')},[_vm._v(_vm._s(facet.count))])])])}),_vm._v(" "),_vm._t("footer")],2):_vm._e()},staticRenderFns: [],
    mixins: [algoliaComponent],

    props: {
      attribute: {
        type: String,
        required: true,
      },
      limit: {
        type: Number,
        default: 10,
      },
      sortBy: {
        default: function default$1$$1() {
          return ['isRefined:desc', 'count:desc', 'name:asc'];
        },
      },
    },

    computed: {
      facetValues: function facetValues() {
        var ref = this.searchStore.getFacetValues(
          this.attribute,
          this.sortBy
        );
        var data = ref.data; if ( data === void 0 ) data = [];

        return data;
      },
      show: function show() {
        return this.facetValues.length > 0;
      },
    },

    methods: {
      handleClick: function handleClick(path) {
        this.searchStore.toggleFacetRefinement(this.attribute, path);
      },
    },

    data: function data() {
      return {
        blockClassName: 'ais-menu',
      };
    },

    created: function created() {
      this.searchStore.maxValuesPerFacet = this.limit;
      this.searchStore.addFacet(
        {
          name: this.attribute,
          attributes: [this.attribute],
        },
        FACET_TREE
      );
    },

    destroyed: function destroyed() {
      this.searchStore.removeFacet(this.attribute);
    },
  };

var SortBySelector = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('select',{directives:[{name:"model",rawName:"v-model",value:(_vm.indexName),expression:"indexName"}],class:_vm.bem(),on:{"change":function($event){var $$selectedVal = Array.prototype.filter.call($event.target.options,function(o){return o.selected}).map(function(o){var val = "_value" in o ? o._value : o.value;return val}); _vm.indexName=$event.target.multiple ? $$selectedVal : $$selectedVal[0];}}},[_vm._l((_vm.indices),function(index){return _vm._t("default",[_c('option',{key:index.name,domProps:{"value":index.name}},[_vm._v(" "+_vm._s(index.label)+" ")])],{indexName:index.name,label:index.label})})],2)},staticRenderFns: [],
  mixins: [algoliaComponent],
  props: {
    indices: {
      type: Array,
      required: true,
    },
  },
  data: function data() {
    return {
      blockClassName: 'ais-sort-by-selector',
    };
  },
  computed: {
    indexName: {
      get: function get() {
        return this.searchStore.indexName;
      },
      set: function set(value) {
        this.searchStore.indexName = value;
      },
    },
  },
  created: function created() {
    var this$1 = this;

    var match = false;
    for (var index in this$1.indices) {
      if (this$1.indices[index].name === this$1.indexName) {
        match = true;
      }
    }

    if (!match) {
      this.indexName = this.indices[0].name;
    }
  },
};

var AisClear = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('button',{class:[_vm.bem(), _vm.disabled ? _vm.bem(null, 'disabled') : ''],attrs:{"type":"reset","disabled":_vm.disabled},on:{"click":function($event){$event.preventDefault();_vm.clear($event);}}},[_vm._t("default",[_c('span',{class:_vm.bem('label')},[_vm._v("Clear")])])],2)},staticRenderFns: [],
  mixins: [algoliaComponent],
  props: {
    clearsQuery: {
      type: Boolean,
      required: false,
      default: true,
    },
    clearsFacets: {
      type: Boolean,
      required: false,
      default: true,
    },
  },
  data: function data() {
    return {
      blockClassName: 'ais-clear',
    };
  },
  computed: {
    disabled: function disabled() {
      if (this.clearsQuery && this.searchStore.query.length > 0) {
        return false;
      }

      if (this.clearsFacets && this.searchStore.activeRefinements.length > 0) {
        return false;
      }

      return true;
    },
  },
  methods: {
    clear: function clear() {
      this.searchStore.stop();
      if (this.clearsQuery && this.searchStore.query.length > 0) {
        this.searchStore.query = '';
      }

      if (this.clearsFacets && this.searchStore.activeRefinements.length > 0) {
        this.searchStore.clearRefinements();
      }
      this.searchStore.start();
      this.searchStore.refresh();
    },
  },
};

var SearchBox = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('form',{attrs:{"role":"search","action":""},on:{"submit":function($event){$event.preventDefault();_vm.onFormSubmit($event);}}},[_vm._t("default",[_c('ais-input',{attrs:{"search-store":_vm.searchStore,"placeholder":_vm.placeholder,"autofocus":_vm.autofocus}}),_vm._v(" "),_c('button',{class:_vm.bem('submit'),attrs:{"type":"submit"}},[_c('svg',{attrs:{"xmlns":"http://www.w3.org/2000/svg","width":"1em","height":"1em","viewBox":"0 0 40 40"}},[_c('title',[_vm._v(_vm._s(_vm.submitTitle))]),_vm._v(" "),_c('path',{attrs:{"d":"M26.804 29.01c-2.832 2.34-6.465 3.746-10.426 3.746C7.333 32.756 0 25.424 0 16.378 0 7.333 7.333 0 16.378 0c9.046 0 16.378 7.333 16.378 16.378 0 3.96-1.406 7.594-3.746 10.426l10.534 10.534c.607.607.61 1.59-.004 2.202-.61.61-1.597.61-2.202.004L26.804 29.01zm-10.426.627c7.323 0 13.26-5.936 13.26-13.26 0-7.32-5.937-13.257-13.26-13.257C9.056 3.12 3.12 9.056 3.12 16.378c0 7.323 5.936 13.26 13.258 13.26z","fillRule":"evenodd"}})])]),_vm._v(" "),_c('ais-clear',{attrs:{"search-store":_vm.searchStore}},[_c('svg',{attrs:{"xmlns":"http://www.w3.org/2000/svg","width":"1em","height":"1em","viewBox":"0 0 20 20"}},[_c('title',[_vm._v(_vm._s(_vm.clearTitle))]),_vm._v(" "),_c('path',{attrs:{"d":"M8.114 10L.944 2.83 0 1.885 1.886 0l.943.943L10 8.113l7.17-7.17.944-.943L20 1.886l-.943.943-7.17 7.17 7.17 7.17.943.944L18.114 20l-.943-.943-7.17-7.17-7.17 7.17-.944.943L0 18.114l.943-.943L8.113 10z","fillRule":"evenodd"}})])])])],2)},staticRenderFns: [],
  mixins: [algoliaComponent],
  props: {
    placeholder: {
      type: String,
      default: '',
    },
    submitTitle: {
      type: String,
      default: 'search',
    },
    clearTitle: {
      type: String,
      default: 'clear',
    },
    autofocus: {
      type: Boolean,
      default: false,
    },
  },
  data: function data() {
    return {
      blockClassName: 'ais-search-box',
    };
  },
  methods: {
    onFormSubmit: function onFormSubmit() {
      var input = this.$el.querySelector('input[type=search]');
      input.blur();
    },
  },
  components: {
    AisInput: AisInput,
    AisClear: AisClear,
  },
};

var Rating = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return (_vm.show)?_c('div',{class:_vm.bem()},[_vm._t("header"),_vm._v(" "),(_vm.currentValue)?_c('a',{class:_vm.bem('clear'),attrs:{"href":"#"},on:{"click":function($event){$event.preventDefault();_vm.clear($event);}}},[_vm._t("clear",[_vm._v("Clear")])],2):_vm._e(),_vm._v(" "),_vm._l((_vm.facetValues),function(facet,key){return _c('div',{key:key,class:[_vm.bem('item'), facet.isRefined ? _vm.bem('item', 'active') : '']},[_c('a',{attrs:{"href":"#"},on:{"click":function($event){$event.preventDefault();_vm.toggleRefinement(facet);}}},[_vm._t("default",[_vm._l((_vm.max),function(n){return [(n <= facet.value)?_c('span',{key:n,class:_vm.bem('star')},[_vm._v("★")]):_c('span',{key:n,class:_vm.bem('star', 'empty')},[_vm._v("☆")])]}),_vm._v("  & up "),_c('span',{class:_vm.bem('count')},[_vm._v(_vm._s(facet.count))])],{value:facet.value,min:_vm.min,max:_vm.max,count:facet.count})],2)])}),_vm._v(" "),_vm._t("footer")],2):_vm._e()},staticRenderFns: [],
  mixins: [algoliaComponent],
  props: {
    attributeName: {
      type: String,
      required: true,
    },
    min: {
      type: Number,
      default: 1,
    },
    max: {
      type: Number,
      default: 5,
    },
  },
  data: function data() {
    return {
      blockClassName: 'ais-rating',
    };
  },
  created: function created() {
    this.searchStore.addFacet(this.attributeName, FACET_OR);
  },
  destroyed: function destroyed() {
    this.searchStore.removeFacet(this.attributeName);
  },
  computed: {
    show: function show() {
      var this$1 = this;

      for (var value in this$1.facetValues) {
        if (this$1.facetValues[value].count > 0) {
          return true;
        }
      }
      return false;
    },
    facetValues: function facetValues() {
      var values = this.searchStore.getFacetValues(
        this.attributeName,
        ['name:asc'],
        this.max + 1
      );

      var stars = [];
      var isRefined = false;

      var loop = function ( i ) {
        var name = i.toString();
        var star = {
          count: 0,
          isRefined: false,
          name: name,
          value: i,
        };

        // eslint-disable-next-line no-loop-func
        values.forEach(function (facetValue) {
          if (facetValue.name === name) {
            if (!isRefined && facetValue.isRefined) {
              isRefined = true;
              star.isRefined = true;
            }
          }
        });

        stars.push(star);
      };

      for (var i = 0; i <= this.max; i++) loop( i );

      stars = stars.reverse();

      var count = 0;

      stars = stars.map(function (star) {
        var newStar = Object.assign({}, star, { count: count });
        values.forEach(function (facetValue) {
          if (facetValue.name === star.name) {
            count += facetValue.count;
            newStar.count = count;
          }
        });
        return newStar;
      });

      return stars.slice(this.min, this.max);
    },
    currentValue: function currentValue() {
      var this$1 = this;

      for (var value in this$1.facetValues) {
        if (this$1.facetValues[value].isRefined) {
          return this$1.facetValues[value].value;
        }
      }

      return undefined;
    },
  },
  methods: {
    toggleRefinement: function toggleRefinement(facet) {
      var this$1 = this;

      if (facet.isRefined) {
        return this.searchStore.clearRefinements(this.attributeName);
      }

      if (facet.count === 0) {
        return undefined;
      }

      this.searchStore.stop();
      this.searchStore.clearRefinements(this.attributeName);
      for (var val = Number(facet.name); val <= this.max; ++val) {
        this$1.searchStore.addFacetRefinement(this$1.attributeName, val);
      }
      this.searchStore.start();
      this.searchStore.refresh();
      return undefined;
    },
    clear: function clear() {
      this.searchStore.clearRefinements(this.attributeName);
    },
  },
};

var RangeInput = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('div',{class:_vm.bem()},[_vm._t("header",[_c('form',{on:{"submit":function($event){$event.preventDefault();_vm.onSubmit(_vm.refinement);}}},[_c('input',{class:_vm.bem('input', 'from'),attrs:{"type":"number","min":_vm.range.min,"max":_vm.range.max,"step":_vm.step,"placeholder":_vm.rangeForRendering.min},domProps:{"value":_vm.refinementForRendering.min},on:{"input":function($event){_vm.refinement.min = $event.target.value;}}}),_vm._v(" "),_vm._t("separator",[_c('span',{class:_vm.bem('separator')},[_vm._v(" to ")])]),_vm._v(" "),_c('input',{class:_vm.bem('input', 'to'),attrs:{"type":"number","min":_vm.range.min,"max":_vm.range.max,"step":_vm.step,"placeholder":_vm.rangeForRendering.max},domProps:{"value":_vm.refinementForRendering.max},on:{"input":function($event){_vm.refinement.max = $event.target.value;}}}),_vm._v(" "),_vm._t("submit",[_c('button',{class:_vm.bem('submit')},[_vm._v("Ok")])])],2),_vm._v(" "),_vm._t("footer")])],2)},staticRenderFns: [],
  mixins: [algoliaComponent],
  props: {
    attributeName: {
      type: String,
      required: true,
    },
    min: {
      type: Number,
    },
    max: {
      type: Number,
    },
    defaultRefinement: {
      type: Object,
      default: function default$1$$1() {
        return {};
      },
    },
    precision: {
      type: Number,
      default: 0,
      validator: function validator(value) {
        return value >= 0;
      },
    },
  },

  data: function data() {
    return {
      blockClassName: 'ais-range-input',
    };
  },

  created: function created() {
    var ref = this.defaultRefinement;
    var minValue = ref.min;
    var maxValue = ref.max;

    var min;
    if (minValue !== undefined) {
      min = minValue;
    } else if (this.min !== undefined) {
      min = this.min;
    }

    var max;
    if (maxValue !== undefined) {
      max = maxValue;
    } else if (this.max !== undefined) {
      max = this.max;
    }

    this.searchStore.stop();

    this.searchStore.addFacet(this.attributeName, FACET_OR);

    if (min !== undefined) {
      this.searchStore.addNumericRefinement(this.attributeName, '>=', min);
    }

    if (max !== undefined) {
      this.searchStore.addNumericRefinement(this.attributeName, '<=', max);
    }

    this.searchStore.start();
    this.searchStore.refresh();
  },

  destroyed: function destroyed() {
    this.searchStore.removeFacet(this.attributeName);
  },

  computed: {
    step: function step() {
      return 1 / Math.pow(10, this.precision);
    },

    refinement: function refinement() {
      var this$1 = this;

      var ref =
        this.searchStore.activeRefinements.find(
          function (ref) {
              var attributeName = ref.attributeName;
              var type = ref.type;
              var operator = ref.operator;

              return attributeName === this$1.attributeName &&
            type === 'numeric' &&
            operator === '>=';
      }
        ) || {};
      var min = ref.numericValue;

      var ref$1 =
        this.searchStore.activeRefinements.find(
          function (ref) {
              var attributeName = ref.attributeName;
              var type = ref.type;
              var operator = ref.operator;

              return attributeName === this$1.attributeName &&
            type === 'numeric' &&
            operator === '<=';
      }
        ) || {};
      var max = ref$1.numericValue;

      return {
        min: min,
        max: max,
      };
    },

    range: function range() {
      var ref = this;
      var minRange = ref.min;
      var maxRange = ref.max;
      var ref$1 = this.searchStore.getFacetStats(
        this.attributeName
      );
      var minStat = ref$1.min;
      var maxStat = ref$1.max;

      var pow = Math.pow(10, this.precision);

      var min;
      if (minRange !== undefined) {
        min = minRange;
      } else if (minStat !== undefined) {
        min = minStat;
      } else {
        min = -Infinity;
      }

      var max;
      if (maxRange !== undefined) {
        max = maxRange;
      } else if (maxStat !== undefined) {
        max = maxStat;
      } else {
        max = Infinity;
      }

      return {
        min: min !== -Infinity ? Math.floor(min * pow) / pow : min,
        max: max !== Infinity ? Math.ceil(max * pow) / pow : max,
      };
    },

    rangeForRendering: function rangeForRendering() {
      var ref = this.range;
      var min = ref.min;
      var max = ref.max;

      var isMinInfinity = min === -Infinity;
      var isMaxInfinity = max === Infinity;

      return {
        min: !isMinInfinity && !isMaxInfinity ? min : '',
        max: !isMinInfinity && !isMaxInfinity ? max : '',
      };
    },

    refinementForRendering: function refinementForRendering() {
      var ref = this.refinement;
      var minValue = ref.min;
      var maxValue = ref.max;
      var ref$1 = this.range;
      var minRange = ref$1.min;
      var maxRange = ref$1.max;

      return {
        min: minValue !== undefined && minValue !== minRange ? minValue : '',
        max: maxValue !== undefined && maxValue !== maxRange ? maxValue : '',
      };
    },
  },

  methods: {
    nextValueForRefinment: function nextValueForRefinment(hasBound, isReset, range, value) {
      var next;
      if (!hasBound && range === value) {
        next = undefined;
      } else if (hasBound && isReset) {
        next = range;
      } else {
        next = value;
      }

      return next;
    },

    onSubmit: function onSubmit(ref) {
      var minNext = ref.min; if ( minNext === void 0 ) minNext = '';
      var maxNext = ref.max; if ( maxNext === void 0 ) maxNext = '';

      var ref$1 = this.range;
      var minRange = ref$1.min;
      var maxRange = ref$1.max;

      var hasMinBound = this.min !== undefined;
      var hasMaxBound = this.max !== undefined;

      var isMinReset = minNext === '';
      var isMaxReset = maxNext === '';

      var minNextAsNumber = !isMinReset ? parseFloat(minNext) : undefined;
      var maxNextAsNumber = !isMaxReset ? parseFloat(maxNext) : undefined;

      var newMinNext = this.nextValueForRefinment(
        hasMinBound,
        isMinReset,
        minRange,
        minNextAsNumber
      );

      var newMaxNext = this.nextValueForRefinment(
        hasMaxBound,
        isMaxReset,
        maxRange,
        maxNextAsNumber
      );

      this.searchStore.stop();

      this.searchStore.removeNumericRefinement(this.attributeName, '>=');
      if (newMinNext !== undefined) {
        this.searchStore.addNumericRefinement(
          this.attributeName,
          '>=',
          newMinNext
        );
      }

      this.searchStore.removeNumericRefinement(this.attributeName, '<=');
      if (newMaxNext !== undefined) {
        this.searchStore.addNumericRefinement(
          this.attributeName,
          '<=',
          newMaxNext
        );
      }

      this.searchStore.start();
      this.searchStore.refresh();
    },
  },
};

var NoResults = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return (_vm.totalResults <= 0)?_c('div',{class:_vm.bem()},[_vm._t("default",[_vm._v(" No results matched your query "),_c('strong',{class:_vm.bem('query')},[_vm._v(_vm._s(_vm.query))])],{query:_vm.query})],2):_vm._e()},staticRenderFns: [],
  mixins: [algoliaComponent],
  data: function data() {
    return {
      blockClassName: 'ais-no-results',
    };
  },
  computed: {
    totalResults: function totalResults() {
      return this.searchStore.totalResults;
    },
    query: function query() {
      return this.searchStore.query;
    },
  },
};

var RefinementList = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return (_vm.show)?_c('div',{class:_vm.bem()},[_vm._t("header"),_vm._v(" "),_vm._l((_vm.facetValues),function(facet){return _c('div',{key:facet.name,class:facet.isRefined ? _vm.bem('item', 'active') : _vm.bem('item')},[_c('label',{class:_vm.bem('label')},[_c('input',{directives:[{name:"model",rawName:"v-model",value:(facet.isRefined),expression:"facet.isRefined"}],class:_vm.bem('checkbox'),attrs:{"type":"checkbox"},domProps:{"value":facet.name,"checked":Array.isArray(facet.isRefined)?_vm._i(facet.isRefined,facet.name)>-1:(facet.isRefined)},on:{"change":[function($event){var $$a=facet.isRefined,$$el=$event.target,$$c=$$el.checked?(true):(false);if(Array.isArray($$a)){var $$v=facet.name,$$i=_vm._i($$a,$$v);if($$el.checked){$$i<0&&(facet.isRefined=$$a.concat([$$v]));}else{$$i>-1&&(facet.isRefined=$$a.slice(0,$$i).concat($$a.slice($$i+1)));}}else{_vm.$set(facet, "isRefined", $$c);}},function($event){_vm.toggleRefinement(facet);}]}}),_vm._v(" "),_vm._t("default",[_c('span',{class:_vm.bem('value')},[_vm._v(_vm._s(facet.name))]),_vm._v(" "),_c('span',{class:_vm.bem('count')},[_vm._v(_vm._s(facet.count))])],{count:facet.count,active:facet.isRefined,value:facet.name})],2)])}),_vm._v(" "),_vm._t("footer")],2):_vm._e()},staticRenderFns: [],
  mixins: [algoliaComponent],
  props: {
    attributeName: {
      type: String,
      required: true,
    },
    operator: {
      type: String,
      default: FACET_OR,
      validator: function validator(rawValue) {
        var value = rawValue.toLowerCase();

        return value === FACET_OR || value === FACET_AND;
      },
    },
    limit: {
      type: Number,
      default: 10,
    },
    sortBy: {
      default: function default$1$$1() {
        return ['isRefined:desc', 'count:desc', 'name:asc'];
      },
    },
  },
  data: function data() {
    return {
      blockClassName: 'ais-refinement-list',
    };
  },
  created: function created() {
    this.searchStore.addFacet(this.attributeName, this.operator);
  },
  destroyed: function destroyed() {
    this.searchStore.removeFacet(this.attributeName);
  },
  computed: {
    facetValues: function facetValues() {
      return this.searchStore.getFacetValues(
        this.attributeName,
        this.sortBy,
        this.limit
      );
    },
    show: function show() {
      return this.facetValues.length > 0;
    },
  },
  methods: {
    toggleRefinement: function toggleRefinement(value) {
      return this.searchStore.toggleFacetRefinement(
        this.attributeName,
        value.name
      );
    },
  },
  watch: {
    operator: function operator() {
      this.searchStore.addFacet(this.attributeName, this.operator);
    },
  },
};

var PriceRange = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('div',{directives:[{name:"show",rawName:"v-show",value:(_vm.show),expression:"show"}],class:_vm.bem()},[_vm._t("header"),_vm._v(" "),(_vm.currencyPlacement === 'left')?_c('span',{class:_vm.bem('currency', 'left')},[_vm._v(" "+_vm._s(_vm.currency)+" ")]):_vm._e(),_vm._v(" "),_c('input',{directives:[{name:"model",rawName:"v-model",value:(_vm.from),expression:"from"}],class:_vm.bem('input', 'from'),attrs:{"type":"number","placeholder":_vm.fromPlaceholder},domProps:{"value":(_vm.from)},on:{"input":function($event){if($event.target.composing){ return; }_vm.from=$event.target.value;}}}),_vm._v(" "),(_vm.currencyPlacement === 'right')?_c('span',{class:_vm.bem('currency', 'right')},[_vm._v(" "+_vm._s(_vm.currency)+" ")]):_vm._e(),_vm._v(" "),_vm._t("default",[_c('span',[_vm._v("to ")])]),_vm._v(" "),(_vm.currencyPlacement === 'left')?_c('span',{class:_vm.bem('currency', 'left')},[_vm._v(" "+_vm._s(_vm.currency)+" ")]):_vm._e(),_vm._v(" "),_c('input',{directives:[{name:"model",rawName:"v-model",value:(_vm.to),expression:"to"}],class:_vm.bem('input', 'to'),attrs:{"type":"number","placeholder":_vm.toPlaceholder},domProps:{"value":(_vm.to)},on:{"input":function($event){if($event.target.composing){ return; }_vm.to=$event.target.value;}}}),_vm._v(" "),(_vm.currencyPlacement === 'right')?_c('span',{class:_vm.bem('currency', 'right')},[_vm._v(" "+_vm._s(_vm.currency)+" ")]):_vm._e(),_vm._v(" "),_vm._t("footer")],2)},staticRenderFns: [],
  mixins: [algoliaComponent],
  props: {
    fromPlaceholder: {
      type: String,
      default: 'min',
    },
    toPlaceholder: {
      type: String,
      default: 'max',
    },
    attributeName: {
      type: String,
      required: true,
    },
    currency: {
      type: String,
      required: false,
      default: '$',
    },
    currencyPlacement: {
      type: String,
      required: false,
      default: 'left',
      validator: function validator(value) {
        return value === 'left' || value === 'right';
      },
    },
  },
  data: function data() {
    return {
      blockClassName: 'ais-price-range',
    };
  },
  computed: {
    show: function show() {
      return this.from || this.to || this.searchStore.totalResults > 0;
    },
    from: {
      get: function get() {
        var this$1 = this;

        for (var refinement in this$1.searchStore.activeRefinements) {
          if (
            this$1.searchStore.activeRefinements[refinement].attributeName ===
              this$1.attributeName &&
            this$1.searchStore.activeRefinements[refinement].type === 'numeric' &&
            this$1.searchStore.activeRefinements[refinement].operator === '>'
          ) {
            return this$1.searchStore.activeRefinements[refinement].numericValue;
          }
        }
        return undefined;
      },
      set: function set(rawValue) {
        var value = Number(rawValue);

        this.searchStore.stop();
        this.searchStore.removeNumericRefinement(this.attributeName, '>');
        if (value > 0) {
          this.searchStore.addNumericRefinement(this.attributeName, '>', value);
        }

        // Remove the max value if lower than the min value.
        if (value > Number(this.to)) {
          this.searchStore.removeNumericRefinement(this.attributeName, '<');
        }

        this.searchStore.start();
        this.searchStore.refresh();
      },
    },
    to: {
      get: function get() {
        var this$1 = this;

        for (var refinement in this$1.searchStore.activeRefinements) {
          if (
            this$1.searchStore.activeRefinements[refinement].attributeName ===
              this$1.attributeName &&
            this$1.searchStore.activeRefinements[refinement].type === 'numeric' &&
            this$1.searchStore.activeRefinements[refinement].operator === '<'
          ) {
            return this$1.searchStore.activeRefinements[refinement].numericValue;
          }
        }
        return undefined;
      },
      set: function set(rawValue) {
        var value = Number(rawValue);

        // Only update when `to` has reached the `from` value.
        if (value < Number(this.from)) {
          return;
        }

        this.searchStore.stop();
        this.searchStore.removeNumericRefinement(this.attributeName, '<');
        if (value > 0) {
          this.searchStore.addNumericRefinement(this.attributeName, '<', value);
        }
        this.searchStore.start();
        this.searchStore.refresh();
      },
    },
  },
};

var PoweredBy = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('div',{class:_vm.bem()},[_c('a',{attrs:{"href":_vm.algoliaUrl}},[_c('svg',{attrs:{"width":"130","viewBox":"0 0 130 18","xmlns":"http://www.w3.org/2000/svg"}},[_c('title',[_vm._v("Search by Algolia")]),_vm._v(" "),_c('defs',[_c('linearGradient',{attrs:{"x1":"-36.868%","y1":"134.936%","x2":"129.432%","y2":"-27.7%","id":"a"}},[_c('stop',{attrs:{"stop-color":"#00AEFF","offset":"0%"}}),_vm._v(" "),_c('stop',{attrs:{"stop-color":"#3369E7","offset":"100%"}})],1)],1),_vm._v(" "),_c('g',{attrs:{"fill":"none","fill-rule":"evenodd"}},[_c('path',{attrs:{"d":"M59.399.022h13.299a2.372 2.372 0 0 1 2.377 2.364V15.62a2.372 2.372 0 0 1-2.377 2.364H59.399a2.372 2.372 0 0 1-2.377-2.364V2.381A2.368 2.368 0 0 1 59.399.022z","fill":"url(#a)"}}),_vm._v(" "),_c('path',{attrs:{"d":"M66.257 4.56c-2.815 0-5.1 2.272-5.1 5.078 0 2.806 2.284 5.072 5.1 5.072 2.815 0 5.1-2.272 5.1-5.078 0-2.806-2.279-5.072-5.1-5.072zm0 8.652c-1.983 0-3.593-1.602-3.593-3.574 0-1.972 1.61-3.574 3.593-3.574 1.983 0 3.593 1.602 3.593 3.574a3.582 3.582 0 0 1-3.593 3.574zm0-6.418v2.664c0 .076.082.131.153.093l2.377-1.226c.055-.027.071-.093.044-.147a2.96 2.96 0 0 0-2.465-1.487c-.055 0-.11.044-.11.104l.001-.001zm-3.33-1.956l-.312-.311a.783.783 0 0 0-1.106 0l-.372.37a.773.773 0 0 0 0 1.101l.307.305c.049.049.121.038.164-.011.181-.245.378-.479.597-.697.225-.223.455-.42.707-.599.055-.033.06-.109.016-.158h-.001zm5.001-.806v-.616a.781.781 0 0 0-.783-.779h-1.824a.78.78 0 0 0-.783.779v.632c0 .071.066.12.137.104a5.736 5.736 0 0 1 1.588-.223c.52 0 1.035.071 1.534.207a.106.106 0 0 0 .131-.104z","fill":"#FFF"}}),_vm._v(" "),_c('path',{attrs:{"d":"M102.162 13.762c0 1.455-.372 2.517-1.123 3.193-.75.676-1.895 1.013-3.44 1.013-.564 0-1.736-.109-2.673-.316l.345-1.689c.783.163 1.819.207 2.361.207.86 0 1.473-.174 1.84-.523.367-.349.548-.866.548-1.553v-.349a6.374 6.374 0 0 1-.838.316 4.151 4.151 0 0 1-1.194.158 4.515 4.515 0 0 1-1.616-.278 3.385 3.385 0 0 1-1.254-.817 3.744 3.744 0 0 1-.811-1.351c-.192-.539-.29-1.504-.29-2.212 0-.665.104-1.498.307-2.054a3.925 3.925 0 0 1 .904-1.433 4.124 4.124 0 0 1 1.441-.926 5.31 5.31 0 0 1 1.945-.365c.696 0 1.337.087 1.961.191a15.86 15.86 0 0 1 1.588.332v8.456h-.001zm-5.954-4.206c0 .893.197 1.885.592 2.299.394.414.904.621 1.528.621.34 0 .663-.049.964-.142a2.75 2.75 0 0 0 .734-.332v-5.29a8.531 8.531 0 0 0-1.413-.18c-.778-.022-1.369.294-1.786.801-.411.507-.619 1.395-.619 2.223zm16.12 0c0 .719-.104 1.264-.318 1.858a4.389 4.389 0 0 1-.904 1.52c-.389.42-.854.746-1.402.975-.548.229-1.391.36-1.813.36-.422-.005-1.26-.125-1.802-.36a4.088 4.088 0 0 1-1.397-.975 4.486 4.486 0 0 1-.909-1.52 5.037 5.037 0 0 1-.329-1.858c0-.719.099-1.411.318-1.999.219-.588.526-1.09.92-1.509.394-.42.865-.741 1.402-.97a4.547 4.547 0 0 1 1.786-.338 4.69 4.69 0 0 1 1.791.338c.548.229 1.019.55 1.402.97.389.42.69.921.909 1.509.23.588.345 1.28.345 1.999h.001zm-2.191.005c0-.921-.203-1.689-.597-2.223-.394-.539-.948-.806-1.654-.806-.707 0-1.26.267-1.654.806-.394.539-.586 1.302-.586 2.223 0 .932.197 1.558.592 2.098.394.545.948.812 1.654.812.707 0 1.26-.272 1.654-.812.394-.545.592-1.166.592-2.098h-.001zm6.962 4.707c-3.511.016-3.511-2.822-3.511-3.274L113.583.926l2.142-.338v10.003c0 .256 0 1.88 1.375 1.885v1.792h-.001zm3.774 0h-2.153V5.072l2.153-.338v9.534zm-1.079-10.542c.718 0 1.304-.578 1.304-1.291 0-.714-.581-1.291-1.304-1.291-.723 0-1.304.578-1.304 1.291 0 .714.586 1.291 1.304 1.291zm6.431 1.013c.707 0 1.304.087 1.786.262.482.174.871.42 1.156.73.285.311.488.735.608 1.182.126.447.186.937.186 1.476v5.481a25.24 25.24 0 0 1-1.495.251c-.668.098-1.419.147-2.251.147a6.829 6.829 0 0 1-1.517-.158 3.213 3.213 0 0 1-1.178-.507 2.455 2.455 0 0 1-.761-.904c-.181-.37-.274-.893-.274-1.438 0-.523.104-.855.307-1.215.208-.36.487-.654.838-.883a3.609 3.609 0 0 1 1.227-.49 7.073 7.073 0 0 1 2.202-.103c.263.027.537.076.833.147v-.349c0-.245-.027-.479-.088-.697a1.486 1.486 0 0 0-.307-.583c-.148-.169-.34-.3-.581-.392a2.536 2.536 0 0 0-.915-.163c-.493 0-.942.06-1.353.131-.411.071-.75.153-1.008.245l-.257-1.749c.268-.093.668-.185 1.183-.278a9.335 9.335 0 0 1 1.66-.142l-.001-.001zm.181 7.731c.657 0 1.145-.038 1.484-.104v-2.168a5.097 5.097 0 0 0-1.978-.104c-.241.033-.46.098-.652.191a1.167 1.167 0 0 0-.466.392c-.121.169-.175.267-.175.523 0 .501.175.79.493.981.323.196.75.289 1.293.289h.001zM84.109 4.794c.707 0 1.304.087 1.786.262.482.174.871.42 1.156.73.29.316.487.735.608 1.182.126.447.186.937.186 1.476v5.481a25.24 25.24 0 0 1-1.495.251c-.668.098-1.419.147-2.251.147a6.829 6.829 0 0 1-1.517-.158 3.213 3.213 0 0 1-1.178-.507 2.455 2.455 0 0 1-.761-.904c-.181-.37-.274-.893-.274-1.438 0-.523.104-.855.307-1.215.208-.36.487-.654.838-.883a3.609 3.609 0 0 1 1.227-.49 7.073 7.073 0 0 1 2.202-.103c.257.027.537.076.833.147v-.349c0-.245-.027-.479-.088-.697a1.486 1.486 0 0 0-.307-.583c-.148-.169-.34-.3-.581-.392a2.536 2.536 0 0 0-.915-.163c-.493 0-.942.06-1.353.131-.411.071-.75.153-1.008.245l-.257-1.749c.268-.093.668-.185 1.183-.278a8.89 8.89 0 0 1 1.66-.142l-.001-.001zm.186 7.736c.657 0 1.145-.038 1.484-.104v-2.168a5.097 5.097 0 0 0-1.978-.104c-.241.033-.46.098-.652.191a1.167 1.167 0 0 0-.466.392c-.121.169-.175.267-.175.523 0 .501.175.79.493.981.318.191.75.289 1.293.289h.001zm8.682 1.738c-3.511.016-3.511-2.822-3.511-3.274L89.461.926l2.142-.338v10.003c0 .256 0 1.88 1.375 1.885v1.792h-.001z","fill":"#182359"}}),_vm._v(" "),_c('path',{attrs:{"d":"M5.027 11.025c0 .698-.252 1.246-.757 1.644-.505.397-1.201.596-2.089.596-.888 0-1.615-.138-2.181-.414v-1.214c.358.168.739.301 1.141.397.403.097.778.145 1.125.145.508 0 .884-.097 1.125-.29a.945.945 0 0 0 .363-.779.978.978 0 0 0-.333-.747c-.222-.204-.68-.446-1.375-.725-.716-.29-1.221-.621-1.515-.994-.294-.372-.44-.82-.44-1.343 0-.655.233-1.171.698-1.547.466-.376 1.09-.564 1.875-.564.752 0 1.5.165 2.245.494l-.408 1.047c-.698-.294-1.321-.44-1.869-.44-.415 0-.73.09-.945.271a.89.89 0 0 0-.322.717c0 .204.043.379.129.524.086.145.227.282.424.411.197.129.551.299 1.063.51.577.24.999.464 1.268.671.269.208.466.442.591.704.125.261.188.569.188.924l-.001.002zm3.98 2.24c-.924 0-1.646-.269-2.167-.808-.521-.539-.782-1.281-.782-2.226 0-.97.242-1.733.725-2.288.483-.555 1.148-.833 1.993-.833.784 0 1.404.238 1.858.714.455.476.682 1.132.682 1.966v.682H7.357c.018.577.174 1.02.467 1.329.294.31.707.465 1.241.465.351 0 .678-.033.98-.099a5.1 5.1 0 0 0 .975-.33v1.026a3.865 3.865 0 0 1-.935.312 5.723 5.723 0 0 1-1.08.091l.002-.001zm-.231-5.199c-.401 0-.722.127-.964.381s-.386.625-.432 1.112h2.696c-.007-.491-.125-.862-.354-1.115-.229-.252-.544-.379-.945-.379l-.001.001zm7.692 5.092l-.252-.827h-.043c-.286.362-.575.608-.865.739-.29.131-.662.196-1.117.196-.584 0-1.039-.158-1.367-.473-.328-.315-.491-.761-.491-1.337 0-.612.227-1.074.682-1.386.455-.312 1.148-.482 2.079-.51l1.026-.032v-.317c0-.38-.089-.663-.266-.851-.177-.188-.452-.282-.824-.282-.304 0-.596.045-.876.134a6.68 6.68 0 0 0-.806.317l-.408-.902a4.414 4.414 0 0 1 1.058-.384 4.856 4.856 0 0 1 1.085-.132c.756 0 1.326.165 1.711.494.385.329.577.847.577 1.552v4.002h-.902l-.001-.001zm-1.88-.859c.458 0 .826-.128 1.104-.384.278-.256.416-.615.416-1.077v-.516l-.763.032c-.594.021-1.027.121-1.297.298s-.406.448-.406.814c0 .265.079.47.236.615.158.145.394.218.709.218h.001zm7.557-5.189c.254 0 .464.018.628.054l-.124 1.176a2.383 2.383 0 0 0-.559-.064c-.505 0-.914.165-1.227.494-.313.329-.47.757-.47 1.284v3.105h-1.262V7.218h.988l.167 1.047h.064c.197-.354.454-.636.771-.843a1.83 1.83 0 0 1 1.023-.312h.001zm4.125 6.155c-.899 0-1.582-.262-2.049-.787-.467-.525-.701-1.277-.701-2.259 0-.999.244-1.767.733-2.304.489-.537 1.195-.806 2.119-.806.627 0 1.191.116 1.692.349l-.381 1.015c-.534-.208-.974-.312-1.321-.312-1.028 0-1.542.682-1.542 2.046 0 .666.128 1.166.384 1.501.256.335.631.502 1.125.502a3.23 3.23 0 0 0 1.595-.419v1.101a2.53 2.53 0 0 1-.722.285 4.356 4.356 0 0 1-.932.086v.002zm8.277-.107h-1.268V9.506c0-.458-.092-.8-.277-1.026-.184-.226-.477-.338-.878-.338-.53 0-.919.158-1.168.475-.249.317-.373.848-.373 1.593v2.949h-1.262V4.801h1.262v2.122c0 .34-.021.704-.064 1.09h.081a1.76 1.76 0 0 1 .717-.666c.306-.158.663-.236 1.072-.236 1.439 0 2.159.725 2.159 2.175v3.873l-.001-.001zm7.649-6.048c.741 0 1.319.269 1.732.806.414.537.62 1.291.62 2.261 0 .974-.209 1.732-.628 2.275-.419.542-1.001.814-1.746.814-.752 0-1.336-.27-1.751-.811h-.086l-.231.704h-.945V4.801h1.262v1.987l-.021.655-.032.553h.054c.401-.591.992-.886 1.772-.886zm-.328 1.031c-.508 0-.875.149-1.098.448-.224.299-.339.799-.346 1.501v.086c0 .723.115 1.247.344 1.571.229.324.603.486 1.123.486.448 0 .787-.177 1.018-.532.231-.354.346-.867.346-1.536 0-1.35-.462-2.025-1.386-2.025l-.001.001zm3.244-.924h1.375l1.209 3.368c.183.48.304.931.365 1.354h.043c.032-.197.091-.436.177-.717.086-.281.541-1.616 1.364-4.004h1.364l-2.541 6.73c-.462 1.235-1.232 1.853-2.31 1.853-.279 0-.551-.03-.816-.091v-.999c.19.043.406.064.65.064.609 0 1.037-.353 1.284-1.058l.22-.559-2.385-5.941h.001z","fill":"#1D3657"}})])])])])},staticRenderFns: [],
  mixins: [algoliaComponent],
  props: {
    searchStore: {
      type: Object,
      default: function default$1$$1() {
        return this._searchStore;
      },
    },
  },
  data: function data() {
    return {
      blockClassName: 'ais-powered-by',
    };
  },
  computed: {
    algoliaUrl: function algoliaUrl() {
      return (
        'https://www.algolia.com/?' +
        'utm_source=vue-instantsearch&' +
        'utm_medium=website&' +
        "utm_content=" + (location.hostname) + "&" +
        'utm_campaign=poweredby'
      );
    },
  },
};

var InstantSearch = {
  Index: Index,
  Highlight: Highlight,
  Snippet: Snippet,
  Input: AisInput,
  Results: Results,
  Stats: Stats,
  Pagination: Pagination,
  ResultsPerPageSelector: ResultsPerPageSelector,
  TreeMenu: TreeMenu,
  Menu: Menu,
  SortBySelector: SortBySelector,
  SearchBox: SearchBox,
  Clear: AisClear,
  Rating: Rating,
  RangeInput: RangeInput,
  NoResults: NoResults,
  RefinementList: RefinementList,
  PriceRange: PriceRange,
  PoweredBy: PoweredBy,

  install: function install(Vue) {
    Vue.component('ais-index', Index);
    Vue.component('ais-highlight', Highlight);
    Vue.component('ais-snippet', Snippet);
    Vue.component('ais-input', AisInput);
    Vue.component('ais-results', Results);
    Vue.component('ais-stats', Stats);
    Vue.component('ais-pagination', Pagination);
    Vue.component('ais-results-per-page-selector', ResultsPerPageSelector);
    Vue.component('ais-tree-menu', TreeMenu);
    Vue.component('ais-menu', Menu);
    Vue.component('ais-sort-by-selector', SortBySelector);
    Vue.component('ais-search-box', SearchBox);
    Vue.component('ais-clear', AisClear);
    Vue.component('ais-rating', Rating);
    Vue.component('ais-range-input', RangeInput);
    Vue.component('ais-no-results', NoResults);
    Vue.component('ais-refinement-list', RefinementList);
    Vue.component('ais-price-range', PriceRange);
    Vue.component('ais-powered-by', PoweredBy);
  },
};

export { algoliaComponent as Component, FACET_AND, FACET_OR, FACET_TREE, createFromAlgoliaCredentials, createFromAlgoliaClient, createFromSerialized, Store, Index, Highlight, Snippet, AisInput as Input, Results, Stats, Pagination, ResultsPerPageSelector, TreeMenu, Menu, SortBySelector, SearchBox, AisClear as Clear, Rating, RangeInput, NoResults, RefinementList, PriceRange, PoweredBy };export default InstantSearch;
