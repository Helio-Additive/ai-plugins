# Reviewer models

The ASCII STL and geometry-only 3MF both describe the same closed 10 mm cube with eight corners and twelve outward-facing triangles. The 3MF uses millimetres, one build item and no embedded printer, material or process profile. Use millimetres for the unitless STL. The geometry and both files were created for these tests. Helio dedicates the two model fixtures to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

| File | SHA-256 |
| --- | --- |
| cube.stl | c9db4b6e4962845cff6806424406fdf4dd73c99b8e76cf444670abb85e2e3f51 |
| cube.3mf | 4de338dac2656681c2475b5e640c8909dd1e6f6f04f20c8b72f4e355082dfd35 |

For the Dragon G-code fixture, run Slicing positive case 4 with the STL. Use the original, unmodified G-code returned for plate 1. Save it privately for the reviewer or seed their account and give them its filename. Record the engine version, filename and SHA-256. Slicer versions, timestamps and machine startup sequences can change the exact G-code. The model dedication applies to the input geometry.
