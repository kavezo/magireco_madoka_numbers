function addMadokaNumber(dataset, resolve) {
  var n = dataset.nodes.length
  // create adjacency matrix -- easier to work with
  var adjacency = new Array(n).fill(false).map(()=>new Array(n).fill(false));
  var nameIdx = {}
  for (var i=0; i<n; i++) {
    nameIdx[dataset.nodes[i].data.id] = i;
  }
  for (var i=0; i<dataset.edges.length; i++) {
    var sourceIdx = nameIdx[dataset.edges[i].data.source];
    var targetIdx = nameIdx[dataset.edges[i].data.target];
    adjacency[sourceIdx][targetIdx] = true;
    adjacency[targetIdx][sourceIdx] = true;
  }

  // Dijkstra's!
  var madokaNumbers = new Array(n).fill(n);
  madokaNumbers[0] = 0; //Madoka is the first
  var visited = [];

  while (visited.length<n) {
    var closest;
    var closestNumber = n;
    for (var i=0; i<n; i++) {
      if (!visited.includes(i) && madokaNumbers[i]<closestNumber) {
        closest = i;
        closestNumber = madokaNumbers[i];
      }
    }
    visited.push(closest);

    for (var i=0; i<n; i++) {
      if (adjacency[closest][i] && closestNumber+1<madokaNumbers[i]) {
        madokaNumbers[i] = closestNumber+1
      }
    }
  }

  // add madoka numbers to name
  for (var i=0; i<n; i++) {
    dataset.nodes[i].data.name += " " + madokaNumbers[i];
  }
  resolve();
}

(function(){
  document.addEventListener('DOMContentLoaded', function(){
    let $$ = selector => Array.from( document.querySelectorAll( selector ) );
    let $ = selector => document.querySelector( selector );

    let tryPromise = fn => Promise.resolve().then( fn );

    let toJson = obj => obj.json();
    let toText = obj => obj.text();

    let cy;

    let $stylesheet = $('#style');
    let getStylesheet = name => {
      let convert = res => name.match(/[.]json$/) ? toJson(res) : toText(res);

      return fetch(`stylesheets/${name}`).then( convert );
    };
    let applyStylesheet = stylesheet => {
      if( typeof stylesheet === typeof '' ){
        cy.style().fromString( stylesheet ).update();
      } else {
        cy.style().fromJson( stylesheet ).update();
      }
    };
    let applyStylesheetFromSelect = () => getStylesheet("plain.cycss").then( applyStylesheet );

    let $dataset = $('#data');
    let getDataset = name => fetch(`datasets/${name}`).then( toJson );
    let applyDataset = dataset => {
      // so new eles are offscreen
      cy.zoom(0.001);
      cy.pan({ x: -9999999, y: -9999999 });

      // replace eles
      cy.elements().remove();
      let calcMadokaNumbers = new Promise((resolve, reject) => addMadokaNumber(dataset, resolve));
      calcMadokaNumbers.then(() => {
        cy.add( dataset );
        cy.getElementById('madoka').addClass('madoka');
      });
    }
    let applyDatasetFromSelect = () => getDataset("custom.json").then( applyDataset );

    let calculateCachedCentrality = () => {
      let nodes = cy.nodes();

      if( nodes.length > 0 && nodes[0].data('centrality') == null ){
        let centrality = cy.elements().closenessCentralityNormalized();

        nodes.forEach( n => n.data( 'centrality', centrality.closeness(n) ) );
      }
    };

    let $layout = $('#layout');
    let maxLayoutDuration = 1500;
    let layoutPadding = 50;
    let concentric = function( node ){
      calculateCachedCentrality();

      return node.data('centrality');
    };
    let levelWidth = function( nodes ){
      calculateCachedCentrality();

      let min = nodes.min( n => n.data('centrality') ).value;
      let max = nodes.max( n => n.data('centrality') ).value;


      return ( max - min ) / 5;
    };
    let layouts = {
      cola: {
        name: 'cola',
        padding: layoutPadding,
        nodeSpacing: 12,
        edgeLengthVal: 45,
        animate: true,
        randomize: true,
        maxSimulationTime: maxLayoutDuration,
        boundingBox: { // to give cola more space to resolve initial overlaps
          x1: 0,
          y1: 0,
          x2: 10000,
          y2: 10000
        },
        edgeLength: function( e ){
          let w = e.data('weight');

          if( w == null ){
            w = 0.5;
          }

          return 45 / w;
        }
      },
      concentricCentrality: {
        name: 'concentric',
        padding: layoutPadding,
        animate: true,
        animationDuration: maxLayoutDuration,
        concentric: concentric,
        levelWidth: levelWidth
      },
      concentricHierarchyCentrality: {
        name: 'concentric',
        padding: layoutPadding,
        animate: true,
        animationDuration: maxLayoutDuration,
        concentric: concentric,
        levelWidth: levelWidth,
        sweep: Math.PI * 2 / 3,
        clockwise: true,
        startAngle: Math.PI * 1 / 6
      },
      custom: { // replace with your own layout parameters
        name: 'preset',
        padding: layoutPadding
      }
    };
    let prevLayout;
    let getLayout = name => Promise.resolve( layouts[ name ] );
    let applyLayout = layout => {
      if( prevLayout ){
        prevLayout.stop();
      }

      let l = prevLayout = cy.makeLayout( layout );

      return l.run().promiseOn('layoutstop');
    }
    let applyLayoutFromSelect = () => Promise.resolve( $layout.value ).then( getLayout ).then( applyLayout );

    let $algorithm = $('#algorithm');
    let getAlgorithm = (name) => {
      switch (name) {
        case 'bfs': return Promise.resolve(cy.elements().bfs.bind(cy.elements()));
        case 'dfs': return Promise.resolve(cy.elements().dfs.bind(cy.elements()));
        case 'astar': return Promise.resolve(cy.elements().aStar.bind(cy.elements()));
        case 'none': return Promise.resolve(undefined);
        case 'custom': return Promise.resolve(undefined); // replace with algorithm of choice
        default: return Promise.resolve(undefined);
      }
    };
    let runAlgorithm = (algorithm) => {
      if (algorithm === undefined) {
        return Promise.resolve(undefined);
      } else {
        let options = {
          root: '#' + cy.nodes()[0].id(),
          // astar requires target; goal property is ignored for other algorithms
          goal: '#' + cy.nodes()[Math.round(Math.random() * (cy.nodes().size() - 1))].id()
        };
        return Promise.resolve(algorithm(options));
      }
    }
    let currentAlgorithm;
    let animateAlgorithm = (algResults) => {
      // clear old algorithm results
      cy.$().removeClass('highlighted start end');
      currentAlgorithm = algResults;
      if (algResults === undefined || algResults.path === undefined) {
        return Promise.resolve();
      }
      else {
        let i = 0;
        // for astar, highlight first and final before showing path
        if (algResults.distance) {
          // Among DFS, BFS, A*, only A* will have the distance property defined
          algResults.path.first().addClass('highlighted start');
          // algResults.path.last().addClass('highlighted end');
          // i is not advanced to 1, so start node is effectively highlighted twice.
          // this is intentional; creates a short pause between highlighting ends and highlighting the path
        }
        return new Promise(resolve => {
          let highlightNext = () => {
            if (currentAlgorithm === algResults && i < algResults.path.length) {
              algResults.path[i].addClass('highlighted');
              i++;
              //setTimeout(highlightNext, 500);
            } else {
              // resolve when finished or when a new algorithm has started visualization
              resolve();
            }
          }
          highlightNext();
        });
      }
    };
    let applyAlgorithmFromSelect = () => Promise.resolve( $algorithm.value ).then( getAlgorithm ).then( runAlgorithm ).then( animateAlgorithm );

    cy = window.cy = cytoscape({
      container: $('#cy')
    });

    cy.on('click', function(evt){
      cy.$().removeClass('highlighted start end');
    });

    cy.on('click', 'node', function(evt){
      cy.$().removeClass('highlighted start end');
      var dijkstra = cy.elements().dijkstra({root: this});
      Promise.resolve(dijkstra).then(a => {
        var path = a.pathTo(cy.getElementById('madoka')); 
        console.log(path);
        path.addClass('highlighted')
      }); //cy.getElementById('madoka').addClass('madoka');
    });

    tryPromise( applyDatasetFromSelect ).then( applyStylesheetFromSelect ).then( applyLayoutFromSelect );

    $layout.addEventListener('change', applyLayoutFromSelect);

    $('#redo-layout').addEventListener('click', applyLayoutFromSelect);
  });
})();

// tooltips with jQuery
$(document).ready(() => $('.tooltip').tooltipster());