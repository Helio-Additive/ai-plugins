# Reviewer models

The ASCII STL and geometry-only 3MF both describe the same closed 10 mm cube with eight corners and twelve outward-facing triangles. The 3MF uses millimetres, one build item and no embedded printer, material or process profile. Use millimetres for the unitless STL. The geometry and both files were created for these tests. Helio dedicates the two model fixtures to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

| File | SHA-256 |
| --- | --- |
| cube.stl | c9db4b6e4962845cff6806424406fdf4dd73c99b8e76cf444670abb85e2e3f51 |
| cube.3mf | 4de338dac2656681c2475b5e640c8909dd1e6f6f04f20c8b72f4e355082dfd35 |

The [Dragon review G-code](helio-dragon-review-cube.gcode) is the original plate 1 output from the cube rehearsal, prepared for a Bambu Lab X1 Carbon with a 0.4 mm nozzle and Bambu PLA Basic. Its SHA-256 is `98aa170b3c08bb589e62e2c854b532f8e3ae13ace36aafa0bce75204537bea1e`. Dragon positive case 3 provides an attachment URL, and the Dragon submission ZIP includes the same bytes in `assets/review/`. Attach this file in a chat with Dragon connected and continue cases 4 and 5 in that chat. The model dedication applies to the input geometry.
