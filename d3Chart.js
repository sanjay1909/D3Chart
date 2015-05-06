 this.d3Chart = {};


 (function () {
     function Scatterplot(config) {
         _config = config;
         if (config.container) {
             _container = "#" + config.container;
         } else {
             _container = "body";
         }

         initializeChart.call(this);
         if (_config.data)
             this.renderChart(_config.data);
     }

     var _container, _config;
     var _quadTree, _brush, _kdRect;
     var _xColumnType, _yColumnType;

     var _svg, _point;
     var _xValue, _yValue, _cValue;
     var _xScale, _yScale;
     var _xMap, _yMap;
     var _xAxis, _yAxis;


     var p = Scatterplot.prototype;

     /*
      * value accessor - returns the value to encode for a given data object.
      * scale - maps value to a visual display encoding, such as a pixel position.
      * map function - maps from data value to display value
      * axis - sets up axis
      */
     function initializeChart() {
         var chart = this;
         // setup x
         _xValue = function (d, i) {
             if (typeof (d[_config.columns.x]) === "string") {
                 if (isNaN(Number(d[_config.columns.x]))) {
                     _xColumnType = "string";
                     if (d.index === undefined) {
                         d.index = i;
                         return i;
                     } else {
                         if (typeof (d.index) === "string")
                             d.index = Number(d.index);
                         return d.index;
                     }
                 } else {
                     _xColumnType = "number";
                     d[_config.columns.x] = Number(d[_config.columns.x]);
                 }

             }
             return d[_config.columns.x];
         }; // data -> value
         _xScale = d3.scale.linear()
             .range([0, _config.size.width]); // value -> display

         _xMap = function (d, i) {
             return _xScale(_xValue.apply(this, [d, i]));
         }; // data -> display

         _xAxis = d3.svg.axis()
             .scale(_xScale)
             .orient("bottom");



         // setup y
         _yValue = function (d) {
             if (typeof (d[_config.columns.y]) === "string") {
                 if (isNaN(Number(d[_config.columns.y]))) {
                     _yColumnType = "string";
                     if (d.index === undefined) {
                         d.index = i;
                         return i;
                     } else {
                         if (typeof (d.index) === "string")
                             d.index = Number(d.index);
                         return d.index;
                     }
                 } else {
                     _yColumnType = "number";
                     d[_config.columns.y] = Number(d[_config.columns.y]);
                 }
             }
             return d[_config.columns.y];
         }; // data -> value
         _yScale = d3.scale.linear()
             .range([_config.size.height, 0]); // value -> display
         _yMap = function (d, i) {
             return _yScale(_yValue.apply(this, [d, i]));
         }; // data -> display
         _yAxis = d3.svg.axis()
             .scale(_yScale)
             .orient("left");



         // setup fill color
         _cValue = function (d) {
             return d[_config.columns.color];
         };

         // add the graph canvas to the mentioned of the webpage
         _svg = d3.select(_container).append("svg")
             .attr("width", _config.size.width + _config.margin.left + _config.margin.right)
             .attr("height", _config.size.height + _config.margin.top + _config.margin.bottom)
             .append("g")
             .attr("transform", "translate(" + _config.margin.left + "," + _config.margin.top + ")")
             .on("mousemove", function (d) {
                 var xy = d3.mouse(d3.select(this)[0][0]);
                 _svg.selectAll(_container + "pt")
                     .attr("cx", xy[0])
                     .attr("cy", xy[1]);
                 _mousemove.call(chart);
             });

         /*kdColor = d3.scale.linear()
             .domain([0, 8]) // max depth of quadtree
             .range(["#efe", "#060"]);*/

         _brush = d3.svg.brush()
             .x(d3.scale.identity().domain([0 - 5, _config.size.width + 5]))
             .y(d3.scale.identity().domain([0 - 5, _config.size.height + 5]))
             .on("brush", this._brushed.bind(this));
     }



     p.setXAttribute = function (xColumn) {
         _config.columns.x = xColumn;
         updateXaxis.call(this);

     }

     p.setYAttribute = function (yColumn) {
         _config.columns.y = yColumn;
         updateYaxis.call(this);

     }

     // [d3.min(_config.data, _xValue.bind(this)) - 1, d3.max(_config.data, _xValue.bind(this)) + 1]
     p.renderChart = function (data) {
         if (data)
             _config.data = data;
         if (!_config.data) {
             console.log('Data not found');
             return;
         }

         _xScale.domain([d3.min(_config.data, _xValue.bind(this)), d3.max(_config.data, _xValue.bind(this))]);
         _yScale.domain([d3.min(_config.data, _yValue.bind(this)), d3.max(_config.data, _yValue.bind(this))]);

         _quadTree = d3.geom.quadtree()
             .extent([[0, 0], [_config.size.width, _config.size.height]])
             .x(_xMap.bind(this))
             .y(_yMap.bind(this))
             (_config.data);

         _xAxis.ticks(_config.data.length);

         if (_xColumnType === "string") {
             _xAxis.tickFormat(function (i) {
                 var labels = _config.data.map(function (d, i) {
                     return d[_config.columns.x];
                 }.bind(this));
                 return labels[i];
             }.bind(this));
         }
         // x-axis
         _svg.append("g")
             .attr("class", "x axis")
             .attr("transform", "translate(0," + _config.size.height + ")")
             .call(_xAxis)
             .selectAll("text")
             .style("text-anchor", "end")
             .attr("dx", "-.8em")
             .attr("dy", ".15em")
             .attr("transform", function (d) {
                 return "rotate(-45)"
             });

         if (_yColumnType === "string") {
             _yAxis.tickFormat(function (i) {
                 var labels = _config.data.map(function (d, i) {
                     return d[_config.columns.y];
                 }.bind(this));
                 return labels[i];
             }.bind(this));
         }

         // y-axis
         _svg.append("g")
             .attr("class", "y axis")
             .call(_yAxis)
             .append("text")
             .attr("transform", "rotate(-90)")
             .attr("y", 0 - _config.margin.left)
             .attr("x", 0 - _config.size.height / 2)
             .attr("dy", "1em")
             .style("text-anchor", "middle")
             .text(_config.columns.y);


         _kdRect = _svg.selectAll(".node")
             .data(this.nodes(_quadTree))
             .enter().append("rect")
             .attr("class", "node")
             .attr("x", function (d) {
                 return d.x1;
             })
             .attr("y", function (d) {
                 return d.y1;
             })
             .attr("width", function (d) {
                 return d.x2 - d.x1;
             })
             .attr("height", function (d) {
                 return d.y2 - d.y1;
             });

         // draw dots
         _point = _svg.selectAll(".point")
             .data(_config.data)
             .enter().append("circle")
             .attr("class", "point")
             .attr("r", 6)
             .attr("cx", _xMap.bind(this))
             .attr("cy", _yMap.bind(this));

         _svg.append("circle")
             .attr("id", _config.container + "pt")
             .attr("r", 6)
             .style("fill", "none");

         _svg.append("g")
             .attr("class", "brush")
             .call(_brush);
     }

     function updateXaxis() {
         _xScale.domain([d3.min(_config.data, _xValue.bind(this)), d3.max(_config.data, _xValue.bind(this))]);

         var container = d3.select(_container).transition();

         container.selectAll(".point")
             .duration(750)
             .attr("cx", _xMap.bind(this));

         container.select(".x.axis") // change the x axis
             .duration(750)
             .call(_xAxis);
     }

     function updateYaxis() {
         _yScale.domain([d3.min(_config.data, _yValue.bind(this)), d3.max(_config.data, _yValue.bind(this))]);
         var container = d3.select(_container).transition();

         container.selectAll(".point")
             .duration(750)
             .attr("cy", _yMap.bind(this));

         container.select(".y.axis") // change the y axis
             .duration(750)
             .call(_yAxis);
     }




     // PDS Collect a list of nodes to draw rectangles, adding extent and depth data
     p.nodes = function (quadtree) {
         var nodes = [];
         quadtree.depth = 0; // root
         quadtree.visit(function (node, x1, y1, x2, y2) {
             node.x1 = x1;
             node.y1 = y1;
             node.x2 = x2;
             node.y2 = y2;
             nodes.push(node);
             for (var i = 0; i < 4; i++) {
                 if (node.nodes[i]) node.nodes[i].depth = node.depth + 1;
             }
         });
         return nodes;
     }




     // Find the nodes within the specified rectangle.
     p.search = function (quadtree, x0, y0, x3, y3) {
         var selectedDataKeys = [];
         quadtree.visit.call(this, function (node, x1, y1, x2, y2) {
             var p = node.point;
             if (p) {
                 p.scanned = true;
                 var colXVal = _xScale(_xValue.apply(this, [p]), p.index);
                 var colYVal = _yScale(_yValue.apply(this, [p]), p.index);
                 p.selected = (colXVal >= x0) && (colXVal < x3) && (colYVal >= y0) && (colYVal < y3);
                 if (p.selected)
                     selectedDataKeys.push(p[_config.columns.key]);
             }
             return x1 >= x3 || y1 >= y3 || x2 < x0 || y2 < y0;
         }.bind(this));
         return selectedDataKeys;
     }

     p._brushed = function () {
         var extent = _brush.extent();
         _point.each(function (d) {
             d.scanned = d.selected = false;
         });
         var keys = this.search.call(this, _quadTree, extent[0][0], extent[0][1], extent[1][0], extent[1][1]);
         this.select();
         if (keys) {
             if (_config.interactions.onSelect && _config.interactions.onSelect.callback) {
                 _config.interactions.onSelect.callback.call(this, keys);
             }
         }

     }
     p.nearest = function (x, y, best, node) {
         var x1 = node.x1,
             y1 = node.y1,
             x2 = node.x2,
             y2 = node.y2;
         node.visited = true;
         // exclude node if point is farther away than best distance in either axis
         if (x < x1 - best.d || x > x2 + best.d || y < y1 - best.d || y > y2 + best.d) {
             return best;
         }
         // test point if there is one, potentially updating best
         var p = node.point;
         if (p) {
             p.scanned = true;
             var dx = _xScale(_xValue.apply(this, [p]), p.index) - x,
                 dy = _yScale(_yValue.apply(this, [p]), p.index) - y,
                 d = Math.sqrt(dx * dx + dy * dy);
             if (d < best.d) {
                 best.d = d;
                 best.p = p;
             }
         }
         // check if kid is on the right or left, and top or bottom
         // and then recurse on most likely kids first, so we quickly find a
         // nearby point and then exclude many larger rectangles later
         var kids = node.nodes;
         var rl = (2 * x > x1 + x2),
             bt = (2 * y > y1 + y2);
         if (kids[bt * 2 + rl]) best = this.nearest.call(this, x, y, best, kids[bt * 2 + rl]);
         if (kids[bt * 2 + (1 - rl)]) best = this.nearest.call(this, x, y, best, kids[bt * 2 + (1 - rl)]);
         if (kids[(1 - bt) * 2 + rl]) best = this.nearest.call(this, x, y, best, kids[(1 - bt) * 2 + rl]);
         if (kids[(1 - bt) * 2 + (1 - rl)]) best = this.nearest.call(this, x, y, best, kids[(1 - bt) * 2 + (1 - rl)]);

         return best;
     }


     function _mousemove() {
         pt = d3.selectAll(_container + 'pt');
         var x = +pt.attr('cx'),
             y = +pt.attr('cy');

         _point.each(function (d) {
             d.scanned = d.selected = false;
         });
         _kdRect.each(function (d) {
             d.visited = false;
         });

         var best = this.nearest.call(this, x, y, {
             d: 8,
             p: null
         }, _quadTree);
         if (best.p) {
             best.p.selected = true;
             //this.probe(best.p);
         }
         // not sure is this the right way, will check
         this.probe();
         if (_config.interactions.onProbe && _config.interactions.onProbe.callback) {
             if (best.p) {
                 _config.interactions.onProbe.callback.call(this, best.p[_config.columns.key]);
             } else {
                 _config.interactions.onProbe.callback.call(this, null);
             }
         }
         /*_kdRect.style('fill', function (d) {
    return d.visited ? kdColor(d.depth) : 'none';
});*/



     }

     // key required for API call
     // Internal calls doesnt require
     p.probe = function (key) {
         if (key) {
             _point.each(function (d) {
                 d.scanned = d.selected = false;
             });
             _config.data.map(function (d) {
                 if (d[_config.columns.key] == key) d.selected = true;
             })
         } else if (key === null) {
             _point.each(function (d) {
                 d.scanned = d.selected = false;
             });
         }
         _point.classed("scanned", function (d) {
             return d.scanned;
         });
         _point.classed("selected", function (d) {
             return d.selected;
         });
     }

     // keys required for API call
     // Internal calls doesnt require
     p.select = function (keys) {
         if (keys) {
             _point.each(function (d) {
                 d.scanned = d.selected = false;
             });
             _config.data.filter(function (d) {
                 for (var i = 0; i < keys.length; i++) {
                     if (d[_config.columns.key] === keys[i])
                         d.selected = true;
                 }
             }.bind(this))

         }
         if (keys && keys.length === 0) {
             _point.each(function (d) {
                 d.scanned = d.selected = false;
             });
         }

         _point.classed("scanned", function (d) {
             return d.scanned;
         });
         _point.classed("selected", function (d) {
             return d.selected;
         });
     }

     d3Chart.Scatterplot = Scatterplot;



 }());
