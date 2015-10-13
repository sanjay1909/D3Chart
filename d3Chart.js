/**
 * @module d3Chart
 */

//namesapce
if (typeof window === 'undefined') {
    this.d3Chart = this.d3Chart || {};
} else {
    window.d3Chart = window.d3Chart || {};
}

(function () {
    var throttle = function (type, name, obj) {
        var obj = obj || window;
        var running = false;
        var func = function () {
            if (running) {
                return;
            }
            running = true;
            requestAnimationFrame(function () {
                obj.dispatchEvent(new CustomEvent(name));
                running = false;
            });
        };
        obj.addEventListener(type, func);
    };

    /* init - you can init any event */
    throttle("resize", "optimizedResize");
})();

//TO-DO 1. seperate axis layer as seperate Object and provide API to control each axis property like lable tick position Units etc....
// 2. Provide Comment for why certain things has to be in initialize chart and few on render chart
// 3. Support for color column
// 4. Support for Size Column
(function () {

    // constructor:
    /**
     * @class Scatterplot
     * @config {Objaect} configuraiton object to set x, y, key columns, Interaction
     * @constructor
     */
    function Scatterplot(config) {

        Object.defineProperty(this, 'internal', {
            value: {}
        });

        this.internal.xScale;
        this.internal.yScale;
        this.internal.xAxis;
        this.internal.yAxis;
        this.internal.xAxisLabel;
        this.internal.yAxisLabel;
        this.internal.xColumnType;
        this.internal.yColumnType;

        this.internal.container;
        this.internal.svg;
        this.internal.chartGroup; // group inside the SVG
        this.internal.points;
        this.internal.brush;
        this.internal.kdRect;

        this.internal.quadTreeFactory;
        this.internal.quadTree;

        if (config) {
            this.create(config);
            if (this.config.data && this.config.data.records.length > 0)
                this.renderChart(this.config.data);

        }

    }


    // setup x
    // data -> value
    // string data are reference to index and tick labels reference to their string data
    function xValue(d, i) {
        var xCol = this.config.data.columns.x;
        if (typeof (d[xCol]) === "string") {
            if (isNaN(Number(d[xCol]))) {
                this.internal.xColumnType = "string";
                d.index = d.index === undefined ? i : (typeof (d.index) === "string" ? Number(d.index) : d.index);
                return d.index;
            } else {
                this.internal.xColumnType = "number";
                d[xCol] = Number(d[xCol]);
            }
        } else if (typeof (d[xCol]) === "number") {
            this.internal.xColumnType = "number";
        }
        return d[xCol];
    }

    // setup y
    // data -> value
    function yValue(d, i) {
        var yCol = this.config.data.columns.y;
        if (typeof (d[yCol]) === "string") {
            if (isNaN(Number(d[yCol]))) {
                this.internal.yColumnType = "string";
                d.index = d.index === undefined ? i : (typeof (d.index) === "string" ? Number(d.index) : d.index);
                return d.index;
            } else {
                this.internal.yColumnType = "number";
                d[yCol] = Number(d[yCol]);
            }
        } else if (typeof (d[yCol]) === "number") {
            this.internal.yColumnType = "number";
        }
        return d[yCol];
    }

    // data -> display
    function xMap(d, i) {
        return this.internal.xScale(xValue.call(this, d, i));
    }


    // data -> display
    function yMap(d, i) {
        return this.internal.yScale(yValue.call(this, d, i));
    }

    // setup fill color
    function cValue(d, i) {
        return d[this.config.data.columns.color];
    }

    // Find the nodes within the specified rectangle.
    function search(quadtree, x0, y0, x3, y3) {
        var selectedDataKeys = [];
        var key = this.config.data.columns.key;
        quadtree.visit(function (node, x1, y1, x2, y2) {
            var p = node.point;
            if (p) {
                p.scanned = true;
                var colXVal = this.internal.xScale(xValue.call(this, p, p.index));
                var colYVal = this.internal.yScale(yValue.call(this, p, p.index));
                p.selected = (colXVal >= x0) && (colXVal < x3) && (colYVal >= y0) && (colYVal < y3);
                if (p.selected)
                    selectedDataKeys.push(p[key]);
            }
            return x1 >= x3 || y1 >= y3 || x2 < x0 || y2 < y0;
        }.bind(this));
        return selectedDataKeys;
    }

    function brushListener() {
        var onSelect = this.config.interactions.onSelect;
        var extent = this.internal.brush.extent();
        this.internal.points.each(function (d) {
            d.scanned = d.selected = false;
        });
        var keys = search.call(this, this.internal.quadTree, extent[0][0], extent[0][1], extent[1][0], extent[1][1]);
        this.select();
        if (keys) {
            if (onSelect && onSelect.callback) {
                onSelect.callback.call(this, keys);
            }
        }

    }

    function nearest(x, y, best, node) {
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
            var dx = this.internal.xScale(xValue.call(this, p, p.index)) - x,
                dy = this.internal.yScale(yValue.call(this, p, p.index)) - y,
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
        if (kids[bt * 2 + rl]) best = nearest.call(this, x, y, best, kids[bt * 2 + rl]);
        if (kids[bt * 2 + (1 - rl)]) best = nearest.call(this, x, y, best, kids[bt * 2 + (1 - rl)]);
        if (kids[(1 - bt) * 2 + rl]) best = nearest.call(this, x, y, best, kids[(1 - bt) * 2 + rl]);
        if (kids[(1 - bt) * 2 + (1 - rl)]) best = nearest.call(this, x, y, best, kids[(1 - bt) * 2 + (1 - rl)]);

        return best;
    }


    function mousemoveListener() {
        var onProbe = this.config.interactions.onProbe;
        var key = this.config.data.columns.key;
        var x = +this.internal.probeCircle.attr('cx'),
            y = +this.internal.probeCircle.attr('cy');

        this.internal.points.each(function (d) {
            d.scanned = d.selected = false;
        });
        this.internal.kdRect.each(function (d) {
            d.visited = false;
        });

        var best = nearest.call(this, x, y, {
            d: 8,
            p: null
        }, this.internal.quadTree);
        if (best.p) {
            best.p.selected = true;
        }
        // not sure is this the right way, will check
        this.probe();
        if (onProbe && onProbe.callback) {
            if (best.p) {
                onProbe.callback.call(this, best.p[key]);
            } else {
                onProbe.callback.call(this, null);
            }
        }
    }




    // PDS Collect a list of nodes to draw rectangles, adding extent and depth data
    function createNodes(quadtree) {
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



    function responsivefy(svg) {;
        var width = parseInt(svg.style("width"));
        var height = parseInt(svg.style("height"));
        var chart = this;

        // add viewBox
        // and call resize so that svg resizes on inital page load
        svg.attr("viewBox", "0 0 " + width + " " + height)
            .attr("perserveAspectRatio", "none")
            .call(resizeFunction.bind(null, chart, svg));

        d3.select(window).on("resize." + this.internal.container.attr('id'), resizeFunction.bind(null, chart, svg));
    }

    function resizeFunction(chart, svg) {
        var targetWidth = parseInt(chart.internal.container.style("width"));
        var targetHeight = parseInt(chart.internal.container.style("height"));
        svg.attr("width", targetWidth);
    }


    /* 1. Apend the 'svg'
     * 2. Apend the 'g' to 'svg' fto draw axis and Points
     * 3. Define the Brush for Selection
     * 4. Append the 'brush' to 'g'
     * 5. Append a 'circle' to 'g' for probing with KDtree - fill set to none to make it invisible
     * 6. Reference the Scale function without domain values, which are added based on data, dynamically.
     * 7. Define the Axis function for X and Y with tickformat Function.
     * 8. Define KD tree Factory function to create KDTree Nodes.
     */
    function init() {

        // responsivefy is added to updated dynamically based on screen resize
        this.internal.svg = this.internal.container.append("svg")
            .attr("width", this.config.size.width + this.config.margin.left + this.config.margin.right)
            .attr("height", this.config.size.height + this.config.margin.top + this.config.margin.bottom)
            .call(responsivefy.bind(this));

        // define the d3 selction array with Group element, where axis and Points are drawn
        this.internal.chartGroup = this.internal.svg.append("g")
            .attr("transform", "translate(" + this.config.margin.left + "," + this.config.margin.top + ")");


        // Brush for Selection
        this.internal.brush = d3.svg.brush()
            .x(d3.scale.identity().domain([0 - 5, this.config.size.width + 5]))
            .y(d3.scale.identity().domain([0 - 5, this.config.size.height + 5]));

        // define the d3 selction array with Group element, brush rectangle is drawn
        this.internal.chartGroup.append("g")
            .attr("class", "brush")
            .call(this.internal.brush);

        // probe Circle
        this.internal.probeCircle = this.internal.chartGroup.append("circle")
            .attr("id", this.config.container.id + "pt")
            .attr("r", 6)
            .style("fill", "none");

        // define the xScale function
        this.internal.xScale = d3.scale.linear()
            .range([0, this.config.size.width])
            .nice(); // value -> display

        // define the yScale function
        this.internal.yScale = d3.scale.linear()
            .range([this.config.size.height, 0])
            .nice(); // value -> display

        // define the xAxis function
        this.internal.xAxis = d3.svg.axis()
            .scale(this.internal.xScale)
            .orient("bottom")
            .tickFormat(function (i) {
                // i is the value here for the particular column
                var label = i;
                if (chart.internal.xColumnType === 'string') {
                    var record = chart.config.data.records[i];
                    label = record ? record[chart.config.data.columns.x] : '';
                }
                return label;
            });

        // define the yAxis function
        this.internal.yAxis = d3.svg.axis()
            .scale(this.internal.yScale)
            .orient("left")
            .tickFormat(function (i) {
                // i is the value here for the particular column
                var label = i;
                if (chart.internal.yColumnType === 'string') {
                    var record = chart.config.data.records[i];
                    label = record ? record[chart.config.data.columns.y] : '';
                }
                return label;
            });

        // defines a function to generate quadtree
        this.internal.quadTreeFactory = d3.geom.quadtree()
            .extent([[0, 0], [this.config.size.width, this.config.size.height]])
            .x(xMap.bind(this))
            .y(yMap.bind(this));

    }

    function attachInteractionListeners() {
        var chart = this;
        this.internal.chartGroup.on("mousemove", function (d) {
            var xy = d3.mouse(d3.select(this)[0][0]);
            chart.internal.probeCircle.attr("cx", xy[0]);
            chart.internal.probeCircle.attr("cy", xy[1]);
            mousemoveListener.call(chart);
        });

        this.internal.brush.on("brush", brushListener.bind(chart));
    }

    /* 1. Config Dynamic Scales to the 'scale' reference by adding new domain values
     * 2. Append the 'g' to chartgroup 'g' to draw axis
     * 3. Append the 'text' to chartgroup 'g' below abd left side of axis(x,y) to label the column Names
     */
    function drawAxis() {

        var data = chart.config.data.records;

        // set the domain value for xScale function based on data min and max value
        this.internal.xScale.domain([d3.min(this.config.data.records, xValue.bind(this)), d3.max(this.config.data.records, xValue.bind(this))]);
        this.internal.yScale.domain([d3.min(this.config.data.records, yValue.bind(this)), d3.max(this.config.data.records, yValue.bind(this))]);

        // x-axis
        // Add the X Axis
        this.internal.chartGroup.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + this.config.size.height + ")")
            .call(this.internal.xAxis) // this will call xAxis Function with current 'g' element and creates ticks and and its labels
            .selectAll("text") //tick labels are selected
            .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("dy", ".15em")
            .attr("transform", function (d) {
                return "rotate(-45)"
            });

        // Add the X Axis Name as Text
        this.internal.xAxisLabel = this.internal.chartGroup.append("text")
            .attr("y", this.config.size.height + this.config.margin.top + this.config.margin.bottom / 2)
            .attr("x", this.config.size.width / 2)
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .text(this.config.data.columns.x);


        // y-axis
        // Add the Y Axis
        this.internal.chartGroup.append("g")
            .attr("class", "y axis")
            .call(this.internal.yAxis)
            .selectAll("text") //tick labels are selected
            .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("transform", function (d) {
                return "rotate(-45)"
            });

        // Add the Y Axis Name as Text
        this.internal.yAxisLabel = this.internal.chartGroup.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - this.config.margin.left)
            .attr("x", 0 - this.config.size.height / 2)
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .text(this.config.data.columns.y);

    }

    /* 1. Get a KDTree for the data
     * 2. Bind data to element of class(.node) and reference the returned updated selection in internal.kdRect
     * 3. Apend the 'rect' to chartgroup 'g' for each node generated from kdtree function
     * 4. Bind data to element of class(.point) and reference the returned updated selection in internal.points
     * 5. Append  'circle' to chartgroup 'g' for each data points
     * 6. Reference the Scale function without domain values, which are added based on data, dynamically.
     * 7. Define the Axis function for X and Y with tickformat Function.
     * 8. Define KD tree function to create KDTree Nodes.
     */
    function drawChart() {
        var chart = this;
        var data = chart.config.data.records;

        //Get Quadtree
        this.internal.quadTree = this.internal.quadTreeFactory(this.config.data.records);

        // bind data to element and store the reference for update selection
        this.internal.kdRect = this.internal.chartGroup.selectAll(".node")
            .data(createNodes(this.internal.quadTree));

        // Append rect for each node
        this.internal.kdRect.enter()
            .append("rect")
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

        // bind data to elements and store the reference for update selection
        this.internal.points = this.internal.chartGroup.selectAll(".point")
            .data(this.config.data.records);

        //draw all dots
        this.internal.points.enter()
            .append("circle")
            .attr("class", "point")
            .attr("r", 6)
            .attr("cx", xMap.bind(this))
            .attr("cy", yMap.bind(this));
    }

    var p = Scatterplot.prototype;

    p.create = function (config) {
        //to-do Implement a better way to maintian config Json
        this.config = {};
        if (config.container) {
            if (config.container.constructor.name === 'String') {
                this.config.container = {
                    'element': document.getElementById(config.container),
                    'id': config.container
                };

            } else {
                //to-do check its dom element if so, get its ID too
                // added flag to check HTMLDivElementConstructor as this the constructor it gave in mobile ... need to double verify this
                if (config.container.constructor.name === 'HTMLDivElement' || config.container.constructor === HTMLDivElementConstructor) {
                    this.config.container = {
                        'element': config.container,
                        'id': config.container.id
                    };
                } else {
                    console.log("Error: " + config.container + " - Not a HTMLDivElement element ")
                }

            }

        } else {
            if (this.config.container.constructor.name === 'String') {
                this.config.container = {
                    'element': document.getElementById(config.container),
                    'id': 'body'
                };
            }

        }

        this.internal.container = d3.select(this.config.container.element);

        if (config.size) {
            this.config.size = config.size;
            if (!config.size.width) this.config.size.width = parseInt(this.internal.container.style('width'), 10);
            if (!config.size.height) {
                this.config.size.height = parseInt(this.internal.container.style('height'), 10);
                if (this.config.size.height == 0) this.config.size.height = 400 // when div dont have child value will be zero
            }

        } else {
            this.config.size = {};
            this.config.size.width = parseInt(this.internal.container.style('width'), 10);
            this.config.size.height = parseInt(this.internal.container.style('height'), 10);
            if (this.config.size.height == 0) this.config.size.height = 400 // when div dont have child value will be zero
        }
        if (config.margin) {
            this.config.margin = config.margin;
            if (!config.margin.left) this.config.margin.left = 20;
            if (!config.margin.right) this.config.margin.right = 20;
            if (!config.margin.top) this.config.margin.top = 20;
            if (!config.margin.bottom) this.config.margin.bottom = 20;
        } else {
            this.config.margin = {};
            this.config.margin.left = this.config.margin.right = this.config.margin.top = this.config.margin.bottom = 20;
        }



        if (config.interactions) {
            this.config.interactions = config.interactions;
        } else {
            this.config.interactions = {}
        }

        init.call(this);
    }

    p.renderChart = function (renderProperties) {

        if (this.config.data) {
            this.config.data = renderProperties;
            redraw.call(this);
            return;
        }
        if (renderProperties)
            this.config.data = renderProperties;

        if (!this.config.data.records) {
            console.error('Data not found');
            return;
        }

        if (renderProperties.columns) {
            this.config.data.columns = renderProperties.columns;
        } else {
            this.config.data.columns = {
                x: '',
                y: '',
                key: ''
            };
        }

        var columns = this.config.data.columns;
        if (!columns.x) {
            console.error('x column is not set yet');
            return;
        } else {
            if (columns.x.constructor !== String) {
                console.error('x value has to be a Column Name in String format.' + columns.x.constructor.name + ' is not supported');
                return;
            }
        }

        if (!columns.y) {
            console.error('y column is not set yet');
            return;
        } else {
            if (columns.y.constructor !== String) {
                console.error('y value has to be a Column Name in String format.' + columns.y.constructor.name + ' is not supported');
                return;
            }
        }

        var data = this.config.data.records;

        if (!columns.key) {
            if (!data[0].hasOwnProperty('index')) {
                console.warn("Its a good practise to set key column. failing to do so, will create a index as key column");
                columns.key = 'index';
                for (var i = 0; i < data.length; i++) {
                    var rec = data[i];
                    rec['index'] = i;
                }
            } else {
                columns.key = 'index';
            }

        }

        drawAxis.call(this);
        drawChart.call(this);
        attachInteractionListeners.call(this);
    }

    function redraw() {
        // set the domain value for xScale function based on data min and max value
        this.internal.xScale.domain([d3.min(this.config.data.records, xValue.bind(this)), d3.max(this.config.data.records, xValue.bind(this))]);
        this.internal.yScale.domain([d3.min(this.config.data.records, yValue.bind(this)), d3.max(this.config.data.records, yValue.bind(this))]);

        this.internal.quadTreeFactory.x(xMap.bind(this));
        this.internal.quadTreeFactory.y(yMap.bind(this));
        this.internal.quadTree = this.internal.quadTreeFactory(this.config.data.records);



        //Select… KD Tree Nodes
        this.internal.kdRect = this.internal.chartGroup.selectAll(".node")
            .data(createNodes(this.internal.quadTree));

        //Enter… for New datas which dont have elements yet
        this.internal.kdRect.enter()
            .append("rect")
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

        //Update… for existing data which has elements
        this.internal.kdRect.transition()
            .duration(350)
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


        //Exit… for existing Elements which has no Data
        this.internal.kdRect.exit()
            .transition()
            .duration(350)
            .remove();


        //Select…
        this.internal.points = this.internal.chartGroup.selectAll(".point")
            .data(this.config.data.records);


        //Enter…
        this.internal.points.enter() //References the enter selection (a subset of the update selection)
            .append("circle") //Creates a new circle
            .attr("class", "point")
            .attr("r", 6)
            .attr("cx", xMap.bind(this))
            .attr("cy", yMap.bind(this));

        //Update…
        this.internal.points.transition() //Initiate a transition on all elements in the update selection (all circles)
            .duration(350)
            .attr("cx", xMap.bind(this))
            .attr("cy", yMap.bind(this));

        //Exit…
        this.internal.points.exit() //References the exit selection (a subset of the update selection)
            .transition() //Initiates a transition on the one element we're deleting
            .duration(350)
            .remove();


        this.internal.chartGroup.select(".x.axis") // change the x axis
            .transition()
            .duration(350)
            .call(this.internal.xAxis)
            .selectAll("text") //tick labels are selected
            .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("dy", ".15em")
            .attr("transform", function (d) {
                return "rotate(-45)"
            });


        this.internal.chartGroup.select(".y.axis") // change the y axis
            .transition()
            .duration(350)
            .call(this.internal.yAxis)
            .selectAll("text") //tick labels are selected
            .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("transform", function (d) {
                return "rotate(-45)"
            });


        this.internal.xAxisLabel.text(this.config.data.columns.x);
        this.internal.yAxisLabel.text(this.config.data.columns.y);

    }


    p.setXAttribute = function (xColumn) {
        if (this.config.data.columns.x !== xColumn) {
            this.config.data.columns.x = xColumn;
            updateXaxis.call(this);
        }
    }

    function updateXaxis() {
        var data = this.config.data.records;
        var xCol = this.config.data.columns.x;

        this.internal.xScale.domain([d3.min(this.config.data.records, xValue.bind(this)), d3.max(this.config.data.records, xValue.bind(this))]);

        this.internal.quadTreeFactory.x(xMap.bind(this));
        this.internal.quadTree = this.internal.quadTreeFactory(this.config.data.records);


        this.internal.kdRect = this.internal.chartGroup.selectAll(".node")
            .data(createNodes(this.internal.quadTree));


        //Update… for existing data which has elements
        this.internal.kdRect.transition()
            .duration(350)
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

        this.internal.points.transition()
            .duration(350)
            .attr("cx", xMap.bind(this));


        this.internal.chartGroup.select(".x.axis") // change the x axis
            .transition()
            .duration(350)
            .call(this.internal.xAxis)
            .selectAll("text") //tick labels are selected
            .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("dy", ".15em")
            .attr("transform", function (d) {
                return "rotate(-45)"
            });
        this.internal.xAxisLabel.text(xCol);
    }

    p.setYAttribute = function (yColumn) {
        if (this.config.data.columns.y !== yColumn) {
            this.config.data.columns.y = yColumn;
            updateYaxis.call(this);
        }
    }



    function updateYaxis() {

        var chart = this;
        var data = this.config.data.records;
        var yCol = this.config.data.columns.y;

        this.internal.yScale.domain([d3.min(this.config.data.records, yValue.bind(this)), d3.max(this.config.data.records, yValue.bind(this))]);

        this.internal.quadTreeFactory.y(yMap.bind(this));
        this.internal.quadTree = this.internal.quadTreeFactory(this.config.data.records);

        this.internal.kdRect = this.internal.chartGroup.selectAll(".node")
            .data(createNodes(this.internal.quadTree));

        this.internal.kdRect.transition()
            .duration(350)
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

        this.internal.points.transition()
            .duration(350)
            .attr("cy", yMap.bind(this));



        this.internal.chartGroup.select(".y.axis") // change the y axis
            .transition()
            .duration(350)
            .call(this.internal.yAxis)
            .selectAll("text") //tick labels are selected
            .style("text-anchor", "end")
            .attr("dx", "-.8em")
            .attr("transform", function (d) {
                return "rotate(-45)"
            });

        this.internal.yAxisLabel.text(yCol);
    }


    // key required for API call
    // Internal calls doesnt require
    p.probe = function (key) {
        var data = this.config.data.records;
        var keyCol = this.config.data.columns.key;
        if (key) {
            this.internal.points.each(function (d) {
                d.scanned = d.selected = false;
            });
            data.map(function (d) {
                if (d[keyCol] === key) d.selected = true;
            })
        } else if (key === null) {
            this.internal.points.each(function (d) {
                d.scanned = d.selected = false;
            });
        }
        this.internal.points.classed("scanned", function (d) {
            return d.scanned;
        });
        this.internal.points.classed("selected", function (d) {
            return d.selected;
        });
    }

    // keys required for API call
    // Internal calls doesnt require
    p.select = function (keys) {
        var data = this.config.data.records;

        if (keys) {
            this.internal.points.each(function (d) {
                d.scanned = d.selected = false;
            });
            data.filter(function (d) {
                for (var i = 0; i < keys.length; i++) {
                    if (d[this.config.data.columns.key] === keys[i])
                        d.selected = true;
                }
            }.bind(this))

        }
        if (keys && keys.length === 0) {
            this.internal.points.each(function (d) {
                d.scanned = d.selected = false;
            });
        }

        this.internal.points.classed("scanned", function (d) {
            return d.scanned;
        });
        this.internal.points.classed("selected", function (d) {
            return d.selected;
        });
    }

    function removeListener() {
        var chart = this;
        chart.internal.chartGroup.on("mousemove", null);
        chart.internal.brush.on("brush", null);
        d3.select(window).on("resize." + chart.internal.container.attr('id'), null);
    }

    p.dispose = function () {
        removeListener.call(this);
    }



    d3Chart.Scatterplot = Scatterplot;



}());
