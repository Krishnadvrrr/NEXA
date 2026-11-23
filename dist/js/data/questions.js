/**
 * Anna University (GE3251) Engineering Graphics Question Bank
 * Structured step-by-step practice problems with expected geometry and validation rules.
 * Coordinates are in millimeters relative to the XY reference line (Y=0).
 * In First Angle Projection:
 *   Y > 0 : Front View (VP / Elevation)
 *   Y < 0 : Top View (HP / Plan)
 */

export const QUESTIONS = [
  // =========================================================================
  // UNIT 1: PROJECTION OF SOLIDS
  // =========================================================================
  {
    id: "solids-sq-prism",
    unit: "Projection of Solids",
    title: "Square Prism — Axis Inclined to HP",
    problemStatement:
      "A square prism of base side 30 mm and axis length 50 mm rests on HP on one of its base edges such that the axis is inclined at 45° to HP and parallel to VP. Draw its projections.",
    parameters: {
      solid: "squarePrism",
      baseEdge: 30,
      height: 50,
      alpha: 45,
      beta: 0,
      restingOn: "base edge"
    },
    steps: [
      {
        stepNumber: 1,
        title: "Draw Reference Line (XY)",
        instruction: "Draw the horizontal reference line (XY) across the sheet using the 2H pencil grade. This divides VP (above) and HP (below).",
        hint: "Select the Line tool with 2H pencil. Draw a horizontal line through Y = 0 mm from X = -150 mm to X = 150 mm.",
        lineType: "2H",
        expectedGeometry: [
          { type: "line", from: [-150, 0], to: [150, 0], style: "axis", label: "XY" }
        ],
        validation: {
          requires: [{ type: "line", minLength: 200, angle: 0, nearY: 0 }]
        }
      },
      {
        stepNumber: 2,
        title: "Simple Position — Top View (Square Base)",
        instruction: "Construct the initial Top View (TV) of the square prism resting on HP. Draw a 30 mm square below the XY line with one edge perpendicular to VP.",
        hint: "Use the Polygon tool or Line tool (HB grade) to draw a 30 mm × 30 mm square from X = -75 mm to -45 mm, Y = -25 mm to -55 mm.",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [-75, -25], to: [-45, -25], style: "outline" },
          { type: "line", from: [-45, -25], to: [-45, -55], style: "outline" },
          { type: "line", from: [-45, -55], to: [-75, -55], style: "outline" },
          { type: "line", from: [-75, -55], to: [-75, -25], style: "outline" }
        ],
        validation: {
          requires: [
            { type: "polygon", sides: 4, edgeLength: 30, inRegion: "belowXY" }
          ]
        }
      },
      {
        stepNumber: 3,
        title: "Projectors to XY Line",
        instruction: "Draw vertical thin projectors (2H) upwards from all base corners of the Top View to meet the XY reference line.",
        hint: "Select Projector tool or 2H line tool. Draw vertical lines at X = -75 mm and X = -45 mm from Y = -25 mm up to Y = 0 mm.",
        lineType: "2H",
        expectedGeometry: [
          { type: "line", from: [-75, -25], to: [-75, 0], style: "construction" },
          { type: "line", from: [-45, -25], to: [-45, 0], style: "construction" },
          { type: "line", from: [-60, -25], to: [-60, 0], style: "axis" }
        ],
        validation: {
          requires: [
            { type: "line", vertical: true, connectsToY: 0, style: "2H" }
          ]
        }
      },
      {
        stepNumber: 4,
        title: "Simple Position — Front View (Rectangle)",
        instruction: "Draw the initial Front View (FV) above the XY line: a 30 mm × 50 mm rectangle resting on HP with its central axis line.",
        hint: "From the base on XY (Y = 0), draw vertical outlines (HB) of height 50 mm up to Y = 50 mm at X = -75 mm and X = -45 mm, and cap the top face.",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [-75, 0], to: [-45, 0], style: "outline" },
          { type: "line", from: [-45, 0], to: [-45, 50], style: "outline" },
          { type: "line", from: [-45, 50], to: [-75, 50], style: "outline" },
          { type: "line", from: [-75, 50], to: [-75, 0], style: "outline" },
          { type: "line", from: [-60, 0], to: [-60, 50], style: "axis" }
        ],
        validation: {
          requires: [
            { type: "box", width: 30, height: 50, inRegion: "aboveXY" }
          ]
        }
      },
      {
        stepNumber: 5,
        title: "Inclined Position — Tilted Front View (45° to HP)",
        instruction: "Tilt the Front View so the axis is inclined at 45° to HP. The base edge rests on XY at 45° inclination to XY.",
        hint: "Redraw the 30 × 50 rectangle rotated by 45° resting with corner at X = 15, Y = 0. Base extends 30 mm at 45°; axis of 50 mm is at 45°.",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [15, 0], to: [36.21, 21.21], style: "outline" },
          { type: "line", from: [36.21, 21.21], to: [0.86, 56.57], style: "outline" },
          { type: "line", from: [0.86, 56.57], to: [-20.36, 35.36], style: "outline" },
          { type: "line", from: [-20.36, 35.36], to: [15, 0], style: "outline" },
          { type: "line", from: [25.61, 10.61], to: [-9.75, 45.96], style: "axis" }
        ],
        validation: {
          requires: [
            { type: "line", angle: 45, inRegion: "aboveXY" }
          ]
        }
      },
      {
        stepNumber: 6,
        title: "Final Top View with Visible & Hidden Edges",
        instruction: "Project downwards from tilted Front View and horizontally from initial Top View to complete the final Top View with visible (HB) and hidden (dashed) edges.",
        hint: "Drop vertical projectors from all 4 tilted corners. Intersect with horizontal projectors at Y = -25 and Y = -55. Connect the outlines and mark the lower resting edge as hidden.",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [-20.36, -25], to: [0.86, -25], style: "outline" },
          { type: "line", from: [0.86, -25], to: [36.21, -25], style: "outline" },
          { type: "line", from: [36.21, -25], to: [36.21, -55], style: "outline" },
          { type: "line", from: [36.21, -55], to: [0.86, -55], style: "outline" },
          { type: "line", from: [0.86, -55], to: [-20.36, -55], style: "outline" },
          { type: "line", from: [-20.36, -55], to: [-20.36, -25], style: "outline" },
          { type: "line", from: [15, -25], to: [15, -55], style: "hidden" }
        ],
        validation: {
          requires: [
            { type: "composite", inRegion: "belowXY", minElements: 4 }
          ]
        }
      }
    ]
  },

  {
    id: "solids-hex-pyramid",
    unit: "Projection of Solids",
    title: "Hexagonal Pyramid — Axis Inclined to HP",
    problemStatement:
      "A hexagonal pyramid of base side 25 mm and axis length 60 mm rests on HP on one of its base corners with the axis inclined at 30° to HP and parallel to VP. Draw its projections.",
    parameters: {
      solid: "hexPyramid",
      baseEdge: 25,
      height: 60,
      alpha: 30,
      beta: 0,
      restingOn: "base corner"
    },
    steps: [
      {
        stepNumber: 1,
        title: "Draw Reference Line (XY)",
        instruction: "Draw the horizontal reference line (XY) with 2H pencil grade across the drafting sheet.",
        hint: "Draw a straight horizontal line at Y = 0 mm from X = -150 to X = 150 mm.",
        lineType: "2H",
        expectedGeometry: [
          { type: "line", from: [-150, 0], to: [150, 0], style: "axis", label: "XY" }
        ],
        validation: {
          requires: [{ type: "line", minLength: 200, angle: 0, nearY: 0 }]
        }
      },
      {
        stepNumber: 2,
        title: "Simple Position — Top View (Hexagonal Base)",
        instruction: "Draw the regular hexagon of 25 mm side below XY such that a diagonal is perpendicular to VP (corners pointing left and right). Connect all corners to the apex center.",
        hint: "Use Polygon generator: 6 sides, 25 mm edge, center around X = -60 mm, Y = -40 mm.",
        lineType: "HB",
        expectedGeometry: [
          { type: "polygon", sides: 6, edgeLength: 25, center: [-60, -40], style: "outline" },
          { type: "point", pos: [-60, -40], label: "o" }
        ],
        validation: {
          requires: [{ type: "polygon", sides: 6, edgeLength: 25, inRegion: "belowXY" }]
        }
      },
      {
        stepNumber: 3,
        title: "Projectors to XY Line",
        instruction: "Project thin vertical lines (2H) upwards from all 6 base corners and apex center to meet the XY line.",
        hint: "Draw vertical lines from base corners up to Y = 0.",
        lineType: "2H",
        expectedGeometry: [
          { type: "line", from: [-85, -40], to: [-85, 0], style: "construction" },
          { type: "line", from: [-60, -40], to: [-60, 0], style: "axis" },
          { type: "line", from: [-35, -40], to: [-35, 0], style: "construction" }
        ],
        validation: {
          requires: [{ type: "line", vertical: true, connectsToY: 0 }]
        }
      },
      {
        stepNumber: 4,
        title: "Simple Position — Front View (Triangle)",
        instruction: "Draw the Front View triangle with base corners on XY and apex o' at height 60 mm along the central axis.",
        hint: "Connect extreme base points (-85, 0) and (-35, 0) to apex (-60, 60), and draw inner slant edges.",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [-85, 0], to: [-35, 0], style: "outline" },
          { type: "line", from: [-85, 0], to: [-60, 60], style: "outline" },
          { type: "line", from: [-35, 0], to: [-60, 60], style: "outline" },
          { type: "line", from: [-60, 0], to: [-60, 60], style: "axis" }
        ],
        validation: {
          requires: [{ type: "line", nearPoint: [-60, 60], inRegion: "aboveXY" }]
        }
      },
      {
        stepNumber: 5,
        title: "Inclined Position — Tilted Front View (Axis at 30° to HP)",
        instruction: "Tilt the Front View triangle so that its central axis is inclined at 30° to HP (base inclined at 60° to XY, resting on one base corner).",
        hint: "Apex o' rotates upwards; the base rests on XY at a single corner point.",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [10, 0], to: [53.3, 25.0], style: "outline" },
          { type: "line", from: [10, 0], to: [-20.0, 51.96], style: "outline" },
          { type: "line", from: [53.3, 25.0], to: [-20.0, 51.96], style: "outline" }
        ],
        validation: {
          requires: [{ type: "line", angle: 30, inRegion: "aboveXY" }]
        }
      },
      {
        stepNumber: 6,
        title: "Final Top View with Visible & Hidden Slant Edges",
        instruction: "Project downwards from tilted FV and horizontally from initial TV to complete the final Top View.",
        hint: "Outer boundary is always continuous (HB). Slant edges facing the viewer are solid, while edges on the underside are hidden (dashed).",
        lineType: "HB",
        expectedGeometry: [
          { type: "polygon", inRegion: "belowXY", style: "outline" }
        ],
        validation: {
          requires: [{ type: "composite", inRegion: "belowXY" }]
        }
      }
    ]
  },

  {
    id: "solids-cylinder",
    unit: "Projection of Solids",
    title: "Cylinder — Axis Inclined to HP",
    problemStatement:
      "A cylinder of base diameter 40 mm and axis 60 mm rests on HP on a point on its base rim, with its axis inclined at 45° to HP and parallel to VP. Draw its projections.",
    parameters: {
      solid: "cylinder",
      diameter: 40,
      radius: 20,
      height: 60,
      alpha: 45,
      beta: 0,
      restingOn: "base rim point"
    },
    steps: [
      {
        stepNumber: 1,
        title: "Draw Reference Line (XY)",
        instruction: "Draw the horizontal reference line (XY) with 2H pencil grade.",
        hint: "Draw a straight horizontal line at Y = 0 mm.",
        lineType: "2H",
        expectedGeometry: [{ type: "line", from: [-150, 0], to: [150, 0], style: "axis", label: "XY" }],
        validation: { requires: [{ type: "line", minLength: 200, angle: 0, nearY: 0 }] }
      },
      {
        stepNumber: 2,
        title: "Simple Position — Top View (Circle)",
        instruction: "Draw a circle of diameter 40 mm (radius 20 mm) below the XY line to represent the cylinder base on HP.",
        hint: "Use Circle tool with radius 20 mm, centered at X = -60 mm, Y = -40 mm. Divide into generators if needed.",
        lineType: "HB",
        expectedGeometry: [
          { type: "circle", center: [-60, -40], radius: 20, style: "outline" },
          { type: "line", from: [-80, -40], to: [-40, -40], style: "axis" },
          { type: "line", from: [-60, -60], to: [-60, -20], style: "axis" }
        ],
        validation: {
          requires: [{ type: "circle", radius: 20, inRegion: "belowXY" }]
        }
      },
      {
        stepNumber: 3,
        title: "Projectors to XY Line",
        instruction: "Project thin vertical lines from the circle's extreme generators and center to meet the XY line.",
        hint: "Draw vertical lines from X = -80, -60, -40 mm up to Y = 0.",
        lineType: "2H",
        expectedGeometry: [
          { type: "line", from: [-80, -40], to: [-80, 0], style: "construction" },
          { type: "line", from: [-60, -40], to: [-60, 0], style: "axis" },
          { type: "line", from: [-40, -40], to: [-40, 0], style: "construction" }
        ],
        validation: { requires: [{ type: "line", vertical: true, connectsToY: 0 }] }
      },
      {
        stepNumber: 4,
        title: "Simple Position — Front View (Rectangle)",
        instruction: "Draw the Front View rectangle (40 mm wide × 60 mm high) resting on XY with the central axis line.",
        hint: "Draw from (-80, 0) to (-40, 0) and height 60 mm up to Y = 60.",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [-80, 0], to: [-40, 0], style: "outline" },
          { type: "line", from: [-40, 0], to: [-40, 60], style: "outline" },
          { type: "line", from: [-40, 60], to: [-80, 60], style: "outline" },
          { type: "line", from: [-80, 60], to: [-80, 0], style: "outline" },
          { type: "line", from: [-60, 0], to: [-60, 60], style: "axis" }
        ],
        validation: { requires: [{ type: "box", width: 40, height: 60, inRegion: "aboveXY" }] }
      },
      {
        stepNumber: 5,
        title: "Inclined Position — Tilted Front View (45° to HP)",
        instruction: "Redraw the Front View rectangle tilted at 45° to HP, resting on one point of its base rim on the XY line.",
        hint: "Base is at 45° to XY, axis is at 45° to XY.",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [20, 0], to: [48.28, 28.28], style: "outline" },
          { type: "line", from: [48.28, 28.28], to: [5.86, 70.71], style: "outline" },
          { type: "line", from: [5.86, 70.71], to: [-22.42, 42.43], style: "outline" },
          { type: "line", from: [-22.42, 42.43], to: [20, 0], style: "outline" }
        ],
        validation: { requires: [{ type: "line", angle: 45, inRegion: "aboveXY" }] }
      },
      {
        stepNumber: 6,
        title: "Final Top View (Projected Ellipses and Tangent Contours)",
        instruction: "Project downwards from the tilted cylinder and horizontally from initial TV. Complete the two projected ellipses for top and base faces, connecting them with outer tangent generators.",
        hint: "The upper circular face projects as a full visible ellipse. The lower resting face is partly hidden (dashed).",
        lineType: "HB",
        expectedGeometry: [
          { type: "composite", inRegion: "belowXY", label: "Final TV Ellipses" }
        ],
        validation: { requires: [{ type: "composite", inRegion: "belowXY" }] }
      }
    ]
  },

  // =========================================================================
  // UNIT 2: SECTION OF SOLIDS
  // =========================================================================
  {
    id: "section-sq-pyramid",
    unit: "Section of Solids",
    title: "Square Pyramid — Section Plane Inclined to HP",
    problemStatement:
      "A square pyramid of base side 35 mm and axis length 60 mm rests with its base on HP such that all edges of the base are equally inclined to VP. It is cut by a section plane perpendicular to VP, inclined at 45° to HP, and bisecting the axis. Draw its Front View, Sectional Top View, and True Shape of Section.",
    parameters: {
      solid: "squarePyramid",
      baseEdge: 35,
      height: 60,
      cuttingAngle: 45,
      bisectAxis: true,
      cutHeight: 30
    },
    steps: [
      {
        stepNumber: 1,
        title: "Draw Reference Line (XY)",
        instruction: "Draw the horizontal reference line (XY) with 2H pencil.",
        hint: "Draw a straight horizontal line at Y = 0 mm.",
        lineType: "2H",
        expectedGeometry: [{ type: "line", from: [-150, 0], to: [150, 0], style: "axis", label: "XY" }],
        validation: { requires: [{ type: "line", minLength: 200, angle: 0, nearY: 0 }] }
      },
      {
        stepNumber: 2,
        title: "Top View — Base Equally Inclined to VP",
        instruction: "Draw the Top View of the square base (35 mm side) below XY with all edges inclined at 45° to XY. Connect diagonal corners to the apex center.",
        hint: "Diagonal corner-to-corner span is 35 × √2 ≈ 49.5 mm. Center at X = -50 mm, Y = -40 mm.",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [-74.75, -40], to: [-50, -15.25], style: "outline" },
          { type: "line", from: [-50, -15.25], to: [-25.25, -40], style: "outline" },
          { type: "line", from: [-25.25, -40], to: [-50, -64.75], style: "outline" },
          { type: "line", from: [-50, -64.75], to: [-74.75, -40], style: "outline" },
          { type: "line", from: [-74.75, -40], to: [-25.25, -40], style: "outline" },
          { type: "line", from: [-50, -15.25], to: [-50, -64.75], style: "outline" }
        ],
        validation: { requires: [{ type: "polygon", sides: 4, edgeLength: 35, inRegion: "belowXY" }] }
      },
      {
        stepNumber: 3,
        title: "Front View (Elevation)",
        instruction: "Project upwards from Top View corners to XY. Draw the triangular Front View with apex o' at height 60 mm above XY.",
        hint: "Base spans from X = -74.75 to -25.25 on XY line; apex is at X = -50, Y = 60.",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [-74.75, 0], to: [-25.25, 0], style: "outline" },
          { type: "line", from: [-74.75, 0], to: [-50, 60], style: "outline" },
          { type: "line", from: [-25.25, 0], to: [-50, 60], style: "outline" },
          { type: "line", from: [-50, 0], to: [-50, 60], style: "outline" }
        ],
        validation: { requires: [{ type: "line", nearPoint: [-50, 60], inRegion: "aboveXY" }] }
      },
      {
        stepNumber: 4,
        title: "Cutting Plane (Section Plane at 45°)",
        instruction: "Draw the cutting plane (AIP) in the Front View: a line inclined at 45° to XY passing through the axis midpoint at height 30 mm (Y = 30 mm).",
        hint: "Select 'Cutting Plane' line style (chain with thick ends and arrows). Line passes through (-50, 30) at 45°.",
        lineType: "Cutting Plane",
        expectedGeometry: [
          { type: "line", from: [-75, 5], to: [-25, 55], style: "cutting", label: "V-T" }
        ],
        validation: { requires: [{ type: "line", angle: 45, nearPoint: [-50, 30], inRegion: "aboveXY" }] }
      },
      {
        stepNumber: 5,
        title: "Sectional Top View with Hatching",
        instruction: "Project the cutting points where the section plane intersects each slant edge down into the Top View. Outline the cut polygon and add 45° thin hatching lines.",
        hint: "Drop vertical lines from cutting points in FV to slant edges in TV. Hatch the enclosed region with 2H lines.",
        lineType: "HB",
        expectedGeometry: [
          { type: "polygon", inRegion: "belowXY", style: "hatching", label: "Section" }
        ],
        validation: { requires: [{ type: "composite", inRegion: "belowXY" }] }
      },
      {
        stepNumber: 6,
        title: "True Shape of Section",
        instruction: "Construct the True Shape of the Section by projecting perpendicular to the cutting plane onto an auxiliary reference line X1-Y1 parallel to the cutting plane.",
        hint: "Draw X1-Y1 parallel to the 45° plane. Transfer lateral distances from the center line in TV onto perpendicular projectors.",
        lineType: "HB",
        expectedGeometry: [
          { type: "polygon", inRegion: "aboveXY", style: "outline", label: "True Shape" }
        ],
        validation: { requires: [{ type: "composite", inRegion: "aboveXY" }] }
      }
    ]
  },

  {
    id: "section-hex-prism",
    unit: "Section of Solids",
    title: "Hexagonal Prism — Section Plane Inclined to HP",
    problemStatement:
      "A hexagonal prism of base side 25 mm and axis 60 mm rests on HP with two rectangular faces parallel to VP. It is cut by a section plane inclined at 40° to HP and passing through a point on the axis 15 mm from the top face. Draw its Front View, Sectional Top View, and Sectional Side View.",
    parameters: {
      solid: "hexPrism",
      baseEdge: 25,
      height: 60,
      cuttingAngle: 40,
      pointFromTop: 15,
      cutHeight: 45
    },
    steps: [
      {
        stepNumber: 1,
        title: "Draw Reference Line (XY)",
        instruction: "Draw the horizontal reference line (XY) with 2H pencil grade.",
        hint: "Draw a straight horizontal line at Y = 0 mm.",
        lineType: "2H",
        expectedGeometry: [{ type: "line", from: [-150, 0], to: [150, 0], style: "axis", label: "XY" }],
        validation: { requires: [{ type: "line", minLength: 200, angle: 0, nearY: 0 }] }
      },
      {
        stepNumber: 2,
        title: "Top View (Hexagonal Base Parallel to VP)",
        instruction: "Draw regular hexagon of 25 mm side below XY such that two opposite edges are parallel to the XY reference line.",
        hint: "Center around X = -60, Y = -45 mm. Top and bottom edges are horizontal.",
        lineType: "HB",
        expectedGeometry: [
          { type: "polygon", sides: 6, edgeLength: 25, center: [-60, -45], style: "outline" }
        ],
        validation: { requires: [{ type: "polygon", sides: 6, edgeLength: 25, inRegion: "belowXY" }] }
      },
      {
        stepNumber: 3,
        title: "Front View (Rectangular Elevation)",
        instruction: "Project vertical lines from all base corners to XY and construct the Front View rectangle of height 60 mm.",
        hint: "Draw visible vertical edges of height 60 mm at the projected corner locations.",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [-85, 0], to: [-35, 0], style: "outline" },
          { type: "line", from: [-35, 0], to: [-35, 60], style: "outline" },
          { type: "line", from: [-35, 60], to: [-85, 60], style: "outline" },
          { type: "line", from: [-85, 60], to: [-85, 0], style: "outline" }
        ],
        validation: { requires: [{ type: "box", height: 60, inRegion: "aboveXY" }] }
      },
      {
        stepNumber: 4,
        title: "Cutting Plane (40° to HP through Y = 45 mm)",
        instruction: "Draw the section plane line inclined at 40° to HP, passing through the axis point 15 mm below the top face (Y = 45 mm).",
        hint: "Use Cutting Plane line style through point (-60, 45) at 40° angle.",
        lineType: "Cutting Plane",
        expectedGeometry: [
          { type: "line", from: [-90, 20], to: [-30, 70], style: "cutting" }
        ],
        validation: { requires: [{ type: "line", angle: 40, nearPoint: [-60, 45], inRegion: "aboveXY" }] }
      },
      {
        stepNumber: 5,
        title: "Sectional Top View",
        instruction: "Project cutting points on each vertical edge into Top View and draw the cross-hatching to represent the cut section.",
        hint: "Because vertical edges of a prism are perpendicular to HP, the sectional Top View coincides with the base hexagon profile.",
        lineType: "HB",
        expectedGeometry: [{ type: "composite", inRegion: "belowXY", style: "hatching" }],
        validation: { requires: [{ type: "composite", inRegion: "belowXY" }] }
      },
      {
        stepNumber: 6,
        title: "Sectional Side View",
        instruction: "Using 45° miter line depth transfer, project the cut points into the Side View (SV) placed beside the Front View.",
        hint: "Transfer heights from FV and widths from TV via the miter line.",
        lineType: "HB",
        expectedGeometry: [{ type: "composite", inRegion: "aboveXY" }],
        validation: { requires: [{ type: "composite", inRegion: "aboveXY" }] }
      }
    ]
  },

  {
    id: "section-cone",
    unit: "Section of Solids",
    title: "Cone — Section Plane Producing an Ellipse",
    problemStatement:
      "A cone of base diameter 50 mm and axis 65 mm rests on its base on HP. A cutting plane inclined at 45° to HP cuts the axis at its midpoint (32.5 mm above base). Draw the Front View, Sectional Top View, and True Shape of the Section (Ellipse).",
    parameters: {
      solid: "cone",
      diameter: 50,
      radius: 25,
      height: 65,
      cuttingAngle: 45,
      cutHeight: 32.5
    },
    steps: [
      {
        stepNumber: 1,
        title: "Draw Reference Line (XY)",
        instruction: "Draw the horizontal reference line (XY) across the sheet using 2H pencil.",
        hint: "Draw a straight horizontal line at Y = 0 mm.",
        lineType: "2H",
        expectedGeometry: [{ type: "line", from: [-150, 0], to: [150, 0], style: "axis", label: "XY" }],
        validation: { requires: [{ type: "line", minLength: 200, angle: 0, nearY: 0 }] }
      },
      {
        stepNumber: 2,
        title: "Top View (Circle with 8/12 Generators)",
        instruction: "Draw a circle of diameter 50 mm (radius 25 mm) below XY. Divide it into 8 or 12 equal radial generators.",
        hint: "Circle center at X = -60, Y = -45 mm. Radial lines from center to perimeter.",
        lineType: "HB",
        expectedGeometry: [
          { type: "circle", center: [-60, -45], radius: 25, style: "outline" }
        ],
        validation: { requires: [{ type: "circle", radius: 25, inRegion: "belowXY" }] }
      },
      {
        stepNumber: 3,
        title: "Front View (Cone Elevation)",
        instruction: "Project generators to XY and draw the Front View triangle with apex o' at height 65 mm (Y = 65 mm).",
        hint: "Base width is 50 mm on XY line from X = -85 to X = -35. Apex at (-60, 65).",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [-85, 0], to: [-35, 0], style: "outline" },
          { type: "line", from: [-85, 0], to: [-60, 65], style: "outline" },
          { type: "line", from: [-35, 0], to: [-60, 65], style: "outline" },
          { type: "line", from: [-60, 0], to: [-60, 65], style: "axis" }
        ],
        validation: { requires: [{ type: "line", nearPoint: [-60, 65], inRegion: "aboveXY" }] }
      },
      {
        stepNumber: 4,
        title: "Cutting Plane (45° Bisecting Axis)",
        instruction: "Draw the section plane line inclined at 45° passing through the axis midpoint at Y = 32.5 mm in Front View.",
        hint: "Cutting plane cuts through all generators from the extreme contour to the opposite slant edge.",
        lineType: "Cutting Plane",
        expectedGeometry: [
          { type: "line", from: [-90, 2.5], to: [-30, 62.5], style: "cutting" }
        ],
        validation: { requires: [{ type: "line", angle: 45, nearPoint: [-60, 32.5], inRegion: "aboveXY" }] }
      },
      {
        stepNumber: 5,
        title: "Sectional Top View (Projected Ellipse)",
        instruction: "Project points where the cutting plane intersects generators down into the Top View. Draw a smooth curve through the points and hatch the section.",
        hint: "Drop projectors vertically to corresponding generator lines in TV to plot the sectional ellipse.",
        lineType: "HB",
        expectedGeometry: [{ type: "composite", inRegion: "belowXY", style: "hatching" }],
        validation: { requires: [{ type: "composite", inRegion: "belowXY" }] }
      },
      {
        stepNumber: 6,
        title: "True Shape of Section (True Ellipse)",
        instruction: "Construct the True Shape of the Section by projecting perpendicular to the cutting plane onto an auxiliary plane X1-Y1. Measure major and minor axes.",
        hint: "Major axis is the length of the cut in FV. Minor axis is obtained from the widest chord in TV.",
        lineType: "HB",
        expectedGeometry: [{ type: "composite", inRegion: "aboveXY", label: "True Shape" }],
        validation: { requires: [{ type: "composite", inRegion: "aboveXY" }] }
      }
    ]
  },

  // =========================================================================
  // UNIT 3: DEVELOPMENT OF LATERAL SURFACES
  // =========================================================================
  {
    id: "dev-sq-prism",
    unit: "Development of Surfaces",
    title: "Truncated Square Prism — Parallel Line Development",
    problemStatement:
      "A square prism of base side 30 mm and axis 60 mm rests on HP with base edges equally inclined to VP. It is cut by a plane inclined at 45° to HP, bisecting the axis. Develop the lateral surface of the truncated prism.",
    parameters: {
      solid: "squarePrism",
      baseEdge: 30,
      height: 60,
      cuttingAngle: 45,
      bisectAxis: true,
      developmentLength: 120 // 4 * 30 mm
    },
    steps: [
      {
        stepNumber: 1,
        title: "Draw Reference Line and Simple Orthographic Views",
        instruction: "Draw XY line, Top View (square 30 mm edge at 45° to XY), and Front View (height 60 mm).",
        hint: "Square base below XY at 45°; vertical prism above XY up to Y = 60 mm.",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [-150, 0], to: [150, 0], style: "axis", label: "XY" },
          { type: "polygon", sides: 4, edgeLength: 30, inRegion: "belowXY" },
          { type: "box", height: 60, inRegion: "aboveXY" }
        ],
        validation: { requires: [{ type: "box", height: 60, inRegion: "aboveXY" }] }
      },
      {
        stepNumber: 2,
        title: "Draw Cutting Plane in Front View",
        instruction: "Draw the 45° section plane passing through the axis midpoint (Y = 30 mm) in the Front View.",
        hint: "Cuts slant/vertical edges at distinct heights 1', 2', 3', 4'.",
        lineType: "Cutting Plane",
        expectedGeometry: [
          { type: "line", from: [-90, 10], to: [-30, 70], style: "cutting" }
        ],
        validation: { requires: [{ type: "line", angle: 45, nearPoint: [-60, 30], inRegion: "aboveXY" }] }
      },
      {
        stepNumber: 3,
        title: "Stretch-Out Line (Baseline for Development)",
        instruction: "Draw a horizontal baseline for development: Total stretch-out length = 4 × 30 mm = 120 mm. Divide into 4 equal segments of 30 mm (A, B, C, D, A).",
        hint: "Draw a line from X = 10 mm to X = 130 mm at Y = 0. Add vertical crease lines at intervals of 30 mm (X = 10, 40, 70, 100, 130).",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [10, 0], to: [130, 0], style: "outline", label: "A-B-C-D-A" },
          { type: "line", from: [10, 0], to: [10, 60], style: "outline" },
          { type: "line", from: [40, 0], to: [40, 60], style: "construction" },
          { type: "line", from: [70, 0], to: [70, 60], style: "construction" },
          { type: "line", from: [100, 0], to: [100, 60], style: "construction" },
          { type: "line", from: [130, 0], to: [130, 60], style: "outline" }
        ],
        validation: { requires: [{ type: "line", minLength: 110, angle: 0, nearY: 0, inRegion: "rightSide" }] }
      },
      {
        stepNumber: 4,
        title: "Horizontal Projectors from Cutting Points",
        instruction: "Project thin horizontal lines (2H) from the cut points in the Front View across to meet the corresponding fold lines A, B, C, D, A in development.",
        hint: "Draw horizontal projection lines from the cutting points in FV across to the right side.",
        lineType: "2H",
        expectedGeometry: [
          { type: "line", from: [-60, 30], to: [130, 30], style: "construction" }
        ],
        validation: { requires: [{ type: "line", horizontal: true, style: "2H" }] }
      },
      {
        stepNumber: 5,
        title: "Complete Development Boundary",
        instruction: "Connect the plotted truncation points with straight lines (HB grade) to form the upper boundary of the developed lateral surface.",
        hint: "For flat prism faces, cut edges are straight lines connecting points 1-2-3-4-1.",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [10, 30], to: [40, 51.2], style: "outline" },
          { type: "line", from: [40, 51.2], to: [70, 30], style: "outline" },
          { type: "line", from: [70, 30], to: [100, 8.8], style: "outline" },
          { type: "line", from: [100, 8.8], to: [130, 30], style: "outline" }
        ],
        validation: { requires: [{ type: "composite", inRegion: "aboveXY" }] }
      }
    ]
  },

  {
    id: "dev-cylinder",
    unit: "Development of Surfaces",
    title: "Truncated Cylinder — Parallel Line Development (12 Divisions)",
    problemStatement:
      "A cylinder of diameter 40 mm and height 60 mm is cut by a plane inclined at 30° to HP, bisecting the axis. Draw the development of the lateral surface of the bottom portion.",
    parameters: {
      solid: "cylinder",
      diameter: 40,
      radius: 20,
      height: 60,
      cuttingAngle: 30,
      cutHeight: 30,
      stretchOutLength: 125.66 // pi * D = 125.66 mm
    },
    steps: [
      {
        stepNumber: 1,
        title: "Draw Orthographic Views and Generator Divisions",
        instruction: "Draw XY line, Top View (circle 40 mm diameter divided into 12 generators), and Front View (40 × 60 mm rectangle).",
        hint: "Divide circle into 12 parts (30° intervals). Project generators to Front View.",
        lineType: "HB",
        expectedGeometry: [
          { type: "circle", center: [-60, -40], radius: 20, style: "outline" },
          { type: "box", width: 40, height: 60, inRegion: "aboveXY" }
        ],
        validation: { requires: [{ type: "box", width: 40, height: 60, inRegion: "aboveXY" }] }
      },
      {
        stepNumber: 2,
        title: "Draw 30° Cutting Plane",
        instruction: "Draw the section plane inclined at 30° to HP bisecting the axis at height 30 mm in Front View.",
        hint: "Passes through point (-60, 30) at angle 30°.",
        lineType: "Cutting Plane",
        expectedGeometry: [
          { type: "line", from: [-85, 15.57], to: [-35, 44.43], style: "cutting" }
        ],
        validation: { requires: [{ type: "line", angle: 30, nearPoint: [-60, 30], inRegion: "aboveXY" }] }
      },
      {
        stepNumber: 3,
        title: "Stretch-Out Line (πD = 125.7 mm)",
        instruction: "Draw the development baseline: Circumference = π × D = 3.1416 × 40 ≈ 125.7 mm. Divide it into 12 equal divisions (~10.47 mm each).",
        hint: "From X = 10 mm to X = 135.7 mm at Y = 0. Draw vertical generators 1 to 12.",
        lineType: "HB",
        expectedGeometry: [
          { type: "line", from: [10, 0], to: [135.66, 0], style: "outline", label: "πD = 125.7 mm" },
          { type: "line", from: [10, 0], to: [10, 60], style: "outline" },
          { type: "line", from: [135.66, 0], to: [135.66, 60], style: "outline" }
        ],
        validation: { requires: [{ type: "line", minLength: 120, angle: 0, inRegion: "rightSide" }] }
      },
      {
        stepNumber: 4,
        title: "Project Heights Horizontally",
        instruction: "Project the cut height on each generator line (1 to 12) from Front View horizontally across to the corresponding division in development.",
        hint: "Generator 1 (left) is at 15.6 mm, generator 7 (right) is at 44.4 mm, midpoint generator 4 is at 30 mm.",
        lineType: "2H",
        expectedGeometry: [
          { type: "line", from: [-60, 30], to: [135.66, 30], style: "construction" }
        ],
        validation: { requires: [{ type: "line", horizontal: true, style: "2H" }] }
      },
      {
        stepNumber: 5,
        title: "Smooth Sinusoidal Development Profile",
        instruction: "Draw a smooth, continuous sinusoidal curve through the 12 plotted points to finish the developed surface of the truncated cylinder.",
        hint: "A cylinder cut by an inclined plane develops into a clean sine wave curve.",
        lineType: "HB",
        expectedGeometry: [{ type: "composite", inRegion: "aboveXY", label: "Sine profile" }],
        validation: { requires: [{ type: "composite", inRegion: "aboveXY" }] }
      }
    ]
  },

  {
    id: "dev-cone",
    unit: "Development of Surfaces",
    title: "Truncated Cone — Radial Line Development",
    problemStatement:
      "A cone of base diameter 50 mm and axis 65 mm rests on HP. A section plane inclined at 45° to HP cuts the axis 25 mm above the base. Develop the lateral surface of the remaining truncated cone.",
    parameters: {
      solid: "cone",
      diameter: 50,
      radius: 25,
      height: 65,
      slantLength: 69.64, // L = sqrt(25^2 + 65^2) = 69.64 mm
      sectorAngle: 129.24, // theta = (r / L) * 360 = (25 / 69.64) * 360 = 129.24 deg
      cutHeight: 25
    },
    steps: [
      {
        stepNumber: 1,
        title: "Draw Orthographic Elevation and Plan",
        instruction: "Draw XY line, Top View (circle 50 mm diameter divided into 8 or 12 parts), and Front View triangle (base 50 mm, axis 65 mm).",
        hint: "Base spans X = -85 to -35 on XY line; apex is at (-60, 65).",
        lineType: "HB",
        expectedGeometry: [
          { type: "circle", center: [-60, -45], radius: 25, style: "outline" },
          { type: "line", from: [-85, 0], to: [-35, 0], style: "outline" },
          { type: "line", from: [-85, 0], to: [-60, 65], style: "outline" },
          { type: "line", from: [-35, 0], to: [-60, 65], style: "outline" },
          { type: "line", from: [-60, 0], to: [-60, 65], style: "axis" }
        ],
        validation: { requires: [{ type: "line", nearPoint: [-60, 65], inRegion: "aboveXY" }] }
      },
      {
        stepNumber: 2,
        title: "Calculate True Slant Length L and Sector Angle θ",
        instruction: "Calculate true generator slant length L = √(25² + 65²) = 69.6 mm. Calculate development sector angle θ = (r / L) × 360° = (25 / 69.64) × 360° ≈ 129.2°.",
        hint: "Apex O is the center of development arc of radius L = 69.6 mm.",
        lineType: "2H",
        expectedGeometry: [{ type: "text", text: "L = 69.6 mm, θ = 129.2°", pos: [20, 80] }],
        validation: { requires: [{ type: "alwaysPass" }] }
      },
      {
        stepNumber: 3,
        title: "Draw 45° Cutting Plane",
        instruction: "In Front View, draw the section plane inclined at 45° to HP passing through the axis at height 25 mm above the base.",
        hint: "Line passes through point (-60, 25) at 45° angle.",
        lineType: "Cutting Plane",
        expectedGeometry: [
          { type: "line", from: [-85, 0], to: [-35, 50], style: "cutting" }
        ],
        validation: { requires: [{ type: "line", angle: 45, nearPoint: [-60, 25], inRegion: "aboveXY" }] }
      },
      {
        stepNumber: 4,
        title: "Draw Sector Arc (Radius L = 69.6 mm, Angle 129.2°)",
        instruction: "Draw an arc of radius L = 69.6 mm subtending an angle θ = 129.2° from apex O. Divide sector into 8 equal sub-angles.",
        hint: "Center apex O at (X = 60, Y = 65). Draw the bounding radius lines and bottom arc.",
        lineType: "HB",
        expectedGeometry: [
          { type: "arc", center: [60, 65], radius: 69.64, startAngle: 0, endAngle: 129.24, style: "outline" }
        ],
        validation: { requires: [{ type: "arc", inRegion: "rightSide" }] }
      },
      {
        stepNumber: 5,
        title: "Transfer True Cut Distances and Connect Curve",
        instruction: "Transfer the true distances of cut points from apex O along generators onto the development radial lines. Connect with a smooth curve (HB) to complete the truncated cone development.",
        hint: "True length of any cut point is found by projecting it horizontally to the extreme outer generator line in FV.",
        lineType: "HB",
        expectedGeometry: [{ type: "composite", inRegion: "rightSide", label: "Truncated cone curve" }],
        validation: { requires: [{ type: "composite", inRegion: "rightSide" }] }
      }
    ]
  }
];

export const TOPICS = [
  { id: "all", name: "All Units (GE3251)" },
  { id: "Projection of Solids", name: "Unit 1: Projection of Solids" },
  { id: "Section of Solids", name: "Unit 2: Section of Solids" },
  { id: "Development of Surfaces", name: "Unit 3: Development of Surfaces" },
  { id: "free-practice", name: "Free Practice (Open Sheet)" }
];
