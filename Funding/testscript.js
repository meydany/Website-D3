Promise.all([d3.csv("funding.csv"), d3.csv("labData.csv")]).then(function (files) {

    var fundingData = files[0]
    var labData = files[1]
    var names = {}
    /* convert values into integers and format into more readable and usable form
     *  yy/mm/dd date is converted into a single number 
     */

    labData.forEach(function (d) {
        var fullName = d.name
        var lastName = fullName.split(" ")[1]

        names[lastName] = fullName
    })

    console.log(names)
    fundingData.forEach(function (d) {
        d.duration = +d.duration;
        d.amount = +d.amount;

        var startDate = d.start

        var year = parseInt(startDate.slice(0, 4));
        var month = parseInt(startDate.slice(4, 6));
        var day = parseInt(startDate.slice(6, 8));

        d.start = year + (month / 12) + (day / 365) - (1 / 12) - (1 / 365);

        if (d.person in names) {
            d.person = names[d.person]
        }
    });



    // grants sorted by duration so that larger bars will be placed higher up on the chart to create a "pyramid" look
    var importedGrants = fundingData.sort(function (a, b) {
        return b.duration >= a.duration;
    })

    // seperate lab and personal grants into two lists because each will be manipulated and used seperately
    var labGrants = importedGrants.filter(grant => grant.type === "Lab")
    var personalGrants = importedGrants.filter(grant => grant.type === "Student")

    // yearRange will store unique date values so that the size and scale of the chart can be determined
    var yearRange = function (grants) {
        var years = [];
        for (grant of grants) {
            years.push(grant.start);
        }
        return years;
    }(importedGrants).filter(function onlyUnique(value, index, self) {
        return self.indexOf(value) === index;
    });

    var minYear = Math.floor(d3.min(yearRange));
    var maxYear = Math.floor(d3.max(yearRange)) + 1;

    /* EDGE CASE
     * get the ending date of the grant with the longest duration because it might go past maxYear
     */
    var maxDurationEnd = Math.floor(getGrantBounds(importedGrants[0]).end);

    if (maxDurationEnd > maxYear) {
        maxYear = maxDurationEnd + 1;
    }

    var width = 1000;
    var height = 500;

    // scale that maps a date value to a position along the x-axis 
    var widthScale = d3.scaleLinear()
        .domain([minYear, maxYear])
        .range([0, width * 0.8]);

    var axis = d3.axisBottom()
        .scale(widthScale)
        .ticks(yearRange.length + 1)
        .tickFormat(d3.format("d"));

    var canvas = d3.selectAll("body")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("transform", "translate(20,0)")

    var defs = canvas.append("defs");

    var filter = defs.append("filter")
        .attr("id", "dropshadow")

    filter.append("feGaussianBlur")
        .attr("in", "SourceAlpha")
        .attr("stdDeviation", 3)
        .attr("result", "blur");
    filter.append("feOffset")
        .attr("in", "blur")
        .attr("dx", 2)
        .attr("dy", 2)
        .attr("result", "offsetBlur");

    var feMerge = filter.append("feMerge");

    feMerge.append("feMergeNode")
        .attr("in", "offsetBlur")
    feMerge.append("feMergeNode")
        .attr("in", "SourceGraphic");

    // <g> element that holds all the lab bars
    var labChartBody = canvas.append("g")
        .attr("transform", "translate(100)")
        .attr("width", width)
        .attr("height", 500)
        .attr("id", "lab-bars")

    var personalChartBody = canvas.append("g")
        .attr("width", width)
        .attr("height", 500)
        .attr("id", "personal-bars")

    // Tooltips
    var tooltipGroup = canvas.append("g")

    var tooltipBody = tooltipGroup.append("rect")
        .attr("rx", 8)
        .attr("ry", 8)
        .attr("fill", "#edf4ff")
        .attr("filter", "url(#dropshadow)");

    var information = ["title", "source", "amount"]
    var tooltipText = tooltipGroup.append("g")
        .attr("id", "tooltip-text")
        .selectAll("text")
        .data(information)
        .enter()
        .append("text")

    // 2D array used to keep track of bar positions, used to check for overlaps
    var labBarPositions = []
    for (grant of labGrants) {
        labBarPositions.push([])
    }

    var labBars = labChartBody.selectAll("rect")
        .data(labGrants)
        .enter()
        .append("rect")
        .attr("width", function (d) {
            // width (length) of bar is determined by start date and duration
            var grantBounds = getGrantBounds(d);

            var startDate = grantBounds.start;
            var endDate = grantBounds.end;

            var scaledStartPosition = widthScale(startDate);
            var scaledEndPosition = widthScale(endDate);

            return scaledEndPosition - scaledStartPosition;
        })
        .attr("height", 30)
        .attr("x", -500)
        .attr("y", function (d, i) {

            // stores bars in a 2D array in order to check for overlap with other bars
            for (var i = 0; i < labBarPositions.length; i++) {

                // no bars in this row yet, so don't need to check for any overlap
                if (labBarPositions[i].length === 0) {
                    labBarPositions[i].push(d)
                    return 50 + (50 * i)
                }

                for (var j = 0; j < labBarPositions[i].length; j++) {
                    var currentGrant = labBarPositions[i][j];
                    var nextGrant = labBarPositions[i][j + 1];
                    var previousGrant = labBarPositions[i][j - 1];

                    // checks for overlap with current, next, and previous bars
                    var currentOverlap = checkOverlap(d, currentGrant);
                    var nextOverlap = !(nextGrant === undefined || !checkOverlap(d, nextGrant));
                    var previousOverlap = !(previousGrant === undefined || !checkOverlap(d, previousGrant));

                    if (!currentOverlap && !nextOverlap && !previousOverlap) {
                        //open spot is found!
                        labBarPositions[i].push(d);
                        return 50 + (50 * i)
                    }
                }
            }

        })
        .attr("id", function (d, i) {
            return "bar-" + importedGrants.indexOf(d)
        })
        .attr("class", "lab-bar")
        .attr("rx", 8)
        .attr("ry", 8)
        .attr("fill", function (d, i) {
            var number = Math.random();
            number = number < 0.2 ? number + 0.2 : number;

            return d3.interpolatePuBu(number);
        })
        .on("mouseover", function (d) {
            var tooltipData = [d.title, d.source, d.amount]
            displayTooltip(tooltipData)
        })
        .on("mousemove", function (d) {
            //update element positions 
            tooltipBody.attr("transform", "translate(" + (d3.event.pageX - 20) + "," + (d3.event.pageY - 30) + ")")
            tooltipText.attr("transform", "translate(" + (d3.event.pageX - 10) + "," + (d3.event.pageY - 30) + ")")
        })
        .on("mouseout", function () {
            tooltipBody.style("visibility", "hidden");
            tooltipText.style("visibility", "hidden");
        })
        .on("click", manageClick)


    // counts the number of rows that actually have bars placed in them
    var numberOfLabRows = labBarPositions.length - labBarPositions.filter(function (a) {
        return a.length === 0
    }).length

    // translate the personal chart body depending on the number of lab bars
    personalChartBody.attr("transform", function () {
        var value = "translate(100,"
        var yValue = (numberOfLabRows + 1) * 50;
        value += yValue + ")"
        return value;
    })

    // same concept for person bars, 2D array to store and manage positions
    var personalBarPositions = []
    for (grant of personalGrants) {
        personalBarPositions.push([])
    }
    var personalBars = personalChartBody.selectAll("rect")
        .data(personalGrants)
        .enter()
        .append("rect")
        .attr("width", function (d) {
            var grantBounds = getGrantBounds(d);

            var startDate = grantBounds.start;
            var endDate = grantBounds.end;

            var scaledStartPosition = widthScale(startDate);
            var scaledEndPosition = widthScale(endDate);

            return scaledEndPosition - scaledStartPosition;
        })
        .attr("height", 30)
        .attr("x", -500)
        .attr("y", function (d, i) {

            //prob not the cleanest, see if anything else can be done
            for (var i = 0; i < personalBarPositions.length; i++) {

                if (personalBarPositions[i].length === 0) {
                    personalBarPositions[i].push(d)
                    return 50 * i
                }

                for (var j = 0; j < personalBarPositions[i].length; j++) {
                    var currentGrant = personalBarPositions[i][j];
                    var nextGrant = personalBarPositions[i][j + 1];
                    var previousGrant = personalBarPositions[i][j - 1];

                    // checks for overlap with current, next, and previous bars
                    var currentOverlap = checkOverlap(d, currentGrant);
                    var nextOverlap = !(nextGrant === undefined || !checkOverlap(d, nextGrant));
                    var previousOverlap = !(previousGrant === undefined || !checkOverlap(d, previousGrant));

                    if (!currentOverlap && !nextOverlap && !previousOverlap) {
                        //open spot is found!
                        personalBarPositions[i].push(d);
                        return 50 * i
                    }
                }
            }

        })
        .attr("id", function (d, i) {
            return "bar-" + importedGrants.indexOf(d)
        })
        .attr("class", "personal-bar")
        .attr("rx", 8)
        .attr("ry", 8)
        .attr("fill", function (d, i) {
            var number = Math.random();
            number = number < 0.2 ? number + 0.2 : number;

            return d3.interpolatePuRd(number);
        })
        .attr("visibility", "hidden")
        .on("mouseover", function (d) {
            var tooltipData = [d.title, d.source, d.amount]
            displayTooltip(tooltipData)
        })
        .on("mousemove", function (d) {
            //update element positions 
            tooltipBody.attr("transform", "translate(" + (d3.event.pageX - 20) + "," + (d3.event.pageY - 30) + ")")
            tooltipText.attr("transform", "translate(" + (d3.event.pageX - 10) + "," + (d3.event.pageY - 30) + ")")
        })
        .on("mouseout", function () {
            tooltipBody.style("visibility", "hidden");
            tooltipText.style("visibility", "hidden");
        })
        .on("click", manageClick)

    // calculates number of rows with personal bars
    var numberOfPersonalRows = personalBarPositions.length - personalBarPositions.filter(function (a) {
        return a.length === 0
    }).length

    var axis = canvas.append("g")
        .attr("transform", function (d, i) {
            var value = "translate(100,"
            var yValue = (numberOfLabRows + numberOfPersonalRows + 1) * 50;
            value += yValue + ")"
            return value;
        })
        .attr("id", "axis")
        .call(axis);

    var groups = ["Lab Grants", "Individual Grants"]
    var legendGroup = canvas.append("g")
        .attr("transform", "translate(0, 20)")

    var legend = legendGroup.selectAll("#legend")
        .data(groups)
        .enter()
        .append("g")
        .attr("transform", function (d, i) {
            var value = "translate(0,"
            value += (30 * i) + ")"
            return value
        })

    var legendRect = legend.append("rect")
        .attr("width", 20)
        .attr("height", 20)
        .attr("rx", 5)
        .attr("ry", 5)
        .attr("fill", function (d, i) {
            var number = Math.random();
            number = number < 0.2 ? number + 0.2 : number;
            if (i == 0) {
                return d3.interpolatePuBu(number);
            } else {
                return d3.interpolatePuRd(number);
            }
        })

    var legendText = legend.append("text")
        .attr("x", 30)
        .attr("y", 14)
        .text(function (d) {
            return d
        })

    //animations

    d3.selectAll(".lab-bar")
        .transition()
        .ease(d3.easeElastic)
        .duration(function (d) {
            return (Math.random() + 0.5) * 1500
        })
        .attr("x", function (d, i) {
            var startDate = d.start;
            return widthScale(startDate);
        })
        .attr("visibility", "visible");

    d3.selectAll(".personal-bar")
        .transition()
        .ease(d3.easeElastic)
        .duration(function (d) {
            return (Math.random() + 0.5) * 1500
        })
        .attr("x", function (d, i) {
            var startDate = d.start;
            return widthScale(startDate);
        })
        .attr("visibility", "visible");


    //-------------------------------MOUSE FUNCTIONS-------------------------------//

    //tooltip function
    function displayTooltip(data) {
        //make tooltip elements visible
        tooltipBody.style("visibility", "visible");
        tooltipText.style("visibility", "visible");

        //adjust size of tooltip depending on size of text
        var maxWidth = 0
        var maxHeight = 0
        d3.select("#tooltip-text").selectAll("text")
            .data(data)
            .text(function (d) {
                if (d > 0) { //if data is a number, add a dollar sign 
                    return "$" + d.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                }
                return d;
            })
            .attr("y", function (d, i) {
                maxWidth = Math.max(maxWidth, this.getBBox().width)
                maxHeight += this.getBBox().height

                return (i + 1) * 20;
            })
            .enter()
            .append("text");

        //adjust height and width of tooltip based on text
        tooltipBody
            .attr("width", maxWidth + 20)
            .attr("height", maxHeight + 25)
    }

    function manageClick() {
        var selectedGroup = d3.select(this)
        var selectedID = "grant-group-" + selectedGroup.attr("id").slice(-1)
        var selectedGroupYPos = parseInt(d3.select("#" + selectedID).attr("y"))
        d3.selectAll(".grant-group").select(function () {
            var currElement = d3.select(this)
            if (currElement.attr("id") === selectedID) {
                currElement.transition()
                    .attr("y", 0)
            } else {
                var currYPos = parseInt(currElement.attr("y"))
                currElement.transition()
                    .attr("y", function () {
                        if (currYPos < selectedGroupYPos) {
                            return currYPos + 200
                        } else {
                            return currYPos
                        }
                    })
            }

        })
    }

    //-------------------------------------FUNDING INFO------------------------------------//

    var fundInfoBody = d3.select("body").append("svg")
        .attr("width", width)
        .attr("height", height * 4)
        .attr("transform", "translate(20, 0)")

    var defs = fundInfoBody.append("defs")
    var people = []
    labData.forEach(function (person) {
        defs.append("pattern")
            .attr("class", "images-pattern")
            .attr("id", function () {
                var lastName = person.name.split(/ /g)[1]
                people.push(lastName)

                return lastName
            })
            .attr("height", "100%")
            .attr("width", "100%")
            .attr("patternContentUnits", "objectBoundingBox")
            .append("image")
            .attr("height", 1)
            .attr("width", 1)
            .attr("preserveAspectRatio", "none")
            .attr("xlink:href", "pics/" + person.image)
    })

    //unknown person def
    defs.append("pattern")
        .attr("class", "images-pattern")
        .attr("id", "unknown")
        .attr("height", "100%")
        .attr("width", "100%")
        .attr("patternContentUnits", "objectBoundingBox")
        .append("image")
        .attr("height", 1)
        .attr("width", 1)
        .attr("preserveAspectRatio", "none")
        .attr("xlink:href", "pics/unknown-user.png")

    fundInfoBody.selectAll("#info-group")
        .data(importedGrants)
        .enter()
        .append("svg")
        .attr("id", function (d, i) {
            return "grant-group-" + i
        })
        .attr("class", "grant-group")
        .attr("width", 1000)
        .attr("height", 150)
        .attr("x", 80)
        .attr("y", function (d, i) {
            return (i) * 200
        })
    // .append("rect")
    // .attr("width", "100%")
    // .attr("height", "100%")
    // .attr("fill", "blue")
    // .attr("opacity", 0.5)

    importedGrants.forEach(function (d, i) {

        var currentGroup = d3.select("#grant-group-" + i)
        currentGroup.append("circle")
            .attr("r", width / 20)
            .style("fill", function () {
                var lastName = d.person.split(/ /g)[1]
                if (people.includes(lastName)) {
                    return "url(#" + lastName + ")"
                } else {
                    return "url(#unknown)"
                }
            })
            .attr("cx", 50)
            .attr("cy", 60)

        grantInformation = [d.subtitle, d.person, "", "Title: " + d.title, "Source: " + d.source, "Amount: $" + d.amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","), "Duration: " + d.duration]
        currentGroup.selectAll("text")
            .data(grantInformation)
            .enter()
            .append("text")
            .attr("x", 130)
            .attr("y", function (d, i) {
                return 20 * (i + 1) - 5
            })
            .text(function (d, i) {
                if (i == 1) {
                    return "Acquired by " + d
                }

                return d;
            })
            .style("font-family", "Verdana")
            .style("font-size", function (d, i) {
                return (i == 0) ? 20 : 12
            })
            .style("font-weight", function (d, i) {
                return (i == 0) ? "bold" : "normal"
            })

        // currentGroup.append("svg")
        //     .attr("id", function(d, i) {
        //         return "grant-" + i
        //     })
        //     .attr("x", function(d) {
        //         return 170
        //     })
        //     .attr("y", function(d) {
        //         return (i+1) * 200 - 50
        //     })
        //     .attr("width", 300)
        //     .attr("height", 120)
        //     .append("g")
        //         .attr("grant-" + i + "-text")
        //         .attr("")
    })





});

// returns start and end dates of bar, which are then used to place them on the axis
function getGrantBounds(grant) {
    var startPositionValue = grant.start;
    var duration = grant.duration;

    var endPositionValue = startPositionValue + (duration / 12);
    return {
        start: startPositionValue,
        end: endPositionValue
    };
}

// checks to see if two bars overlap
function checkOverlap(grant1, grant2) {
    var g1 = getGrantBounds(grant1);
    var g2 = getGrantBounds(grant2);

    var overlap_type1 = (g1.start <= g2.start && g1.end >= g2.start);
    var overlap_type2 = (g1.start >= g2.start && g1.start <= g2.end);

    return overlap_type1 || overlap_type2;
}

Array.prototype.insert = function (index, item) {
    this.splice(index, 0, item);
};

d3.selection.prototype.first = function () {
    return d3.select(this[0][0]);
};