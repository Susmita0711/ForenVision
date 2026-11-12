# ForenVision AI Image Forensics & Error Level Analysis (ELA) Specification

## 1. Executive Summary & Forensic Principles

The **Image Forensics Module** in ForenVision AI provides forensically sound, reproducible visual and metadata diagnostics for photographic evidence. The system adheres to strict forensic standards:

1. **Zero-Modification of Evidence**: Original evidence bytes are never overwritten, edited, or recompressed in place.
2. **Dedicated Working Copies**: All diagnostics operate on isolated, temporary in-memory buffers or separately stored derived visualization files (`uploads/vault/<case>/derived/`).
3. **No Fabricated Certainty**: ForenVision AI does **not** fabricate tampering likelihood percentages, machine-learning confidence scores, or definitive manipulation verdicts. ELA results present objective mathematical metrics alongside rigorous forensic disclaimers.

---

## 2. Feature A: Metadata & Provenance Extraction

### 2.1 Extraction Pipeline
When an authorized evidence artifact is queried (`POST /api/analysis/image/metadata`):
1. **Secure Ingestion**: Raw original bytes are retrieved via `evidence_service.get_evidence_file_bytes`, validating case-level access clearances.
2. **Container & Dimension Validation**: The image is validated against a maximum dimension ceiling of $10,000 \times 10,000$ pixels and a $100\text{ MP}$ limit to protect against decompression bomb denial-of-service vectors.
3. **EXIF & SubIFD Parsing**:
   - **Root EXIF**: Make, Model, Software/Firmware, Orientation.
   - **Exif SubIFD (`0x8769`)**: `DateTimeOriginal`, `DateTimeDigitized`, `FocalLength`, `FNumber`, `ExposureTime`, `ISOSpeedRatings`.
   - **GPS SubIFD (`0x8825`)**: Coordinates are parsed from rational degrees/minutes/seconds into signed decimal degrees, altitude in meters, and satellite UTC timestamp.
4. **Data Sanitization**: All values (e.g. `IFDRational`, raw binary tuples, null-terminated byte strings) are recursively sanitized into standard JSON primitives.

### 2.2 Forensic Caveats on Metadata
- **Missing Fields Audit**: The module compares extracted tags against a standard forensic baseline (`Make`, `Model`, `DateTimeOriginal`, `GPSInfo`, `LensModel`, `FNumber`, etc.) and explicitly records any missing fields. Absence of standard tags often indicates consumer editing, social media stripping, or synthetic generation.
- **Timestamp Provenance Alert**: Embedded EXIF timestamps (`DateTimeOriginal`) are easily altered, stripped, or falsified by camera clock drift or basic software utilities. ForenVision AI flags this explicitly:
  > Embedded metadata timestamps cannot be accepted as authoritative legal proof of chronological occurrence without corroborating network/system logs or cryptographic timestamps.

---

## 3. Feature B: Error Level Analysis (ELA)

### 3.1 Documented Recompression Algorithm
Error Level Analysis measures the rate of error introduced by JPEG lossy compression across different sections of an image:

1. **Working Copy Generation**: Original evidence bytes are decoded into an in-memory 24-bit RGB raster working copy.
2. **Controlled Recompression**: The working copy is compressed as a JPEG into a memory buffer at a user-specified quality level $Q \in [60, 98]$ (default $Q = 90$):
   $$\text{Img}_{\text{recompressed}} = \text{JPEGCompress}(\text{Img}_{\text{working}}, \text{quality}=Q)$$
3. **Pixel Delta Matrix**: The absolute difference matrix between the working raster and recompressed raster is computed per channel:
   $$\Delta(x, y) = |\text{Img}_{\text{working}}(x, y) - \text{Img}_{\text{recompressed}}(x, y)|$$
4. **Contrast Scaling**: For human visual evaluation, the difference is scaled by a multiplier $S \in [5, 35]$ (default $S = 15$):
   $$\text{ELA}_{\text{visual}}(x, y) = \min(255, \Delta(x, y) \times S)$$
5. **Objective Statistical Quantification**:
   - **Mean Pixel Error ($\mu$)**: Average 8-bit channel divergence across the raster.
   - **Peak Error ($P_{\max}$)**: Maximum observed delta ($0 \le P_{\max} \le 255$).
   - **Standard Deviation ($\sigma$)**: Variance dispersion metric indicating how uniformly the image degrades upon recompression.

### 3.2 Interpretation Boundaries & Forensic Reality Check

> [!CAUTION]
> **Why ELA is NOT Proof of Tampering**:
> High ELA brightness (high error) indicates an area that degraded significantly during recompression. This occurs naturally in:
> - High-contrast edges and sharp transitions.
> - High-frequency textures (foliage, hair, coarse cloth, grain).
> - Saturated colors (e.g. bright red or deep blue channel quantization).
> 
> Low ELA brightness indicates an area that degraded less, typical of:
> - Low-contrast, smooth regions (clear sky, flat walls).
> - Areas that have already been saved multiple times at a similar JPEG quality level.
> 
> Therefore, ELA visualizes compression variance—**it does not prove intentional splice or clone manipulation**.

---

## 4. Frontend & User Experience Architecture

1. **Artifact Selector**: Dropdown listing accessible image artifacts across authorized cases with SHA-256 and docket references.
2. **Interactive View Modes**:
   - **Side by Side**: Master evidence image and derived ELA visualization displayed adjacent for comparison.
   - **Blend Overlay**: Alpha-blended composite allowing the examiner to cross-fade between original pixels and ELA gradients using an opacity slider.
   - **ELA Only / Master Only**: Full-resolution single view.
3. **Parameter Controls**: Real-time sliders for Recompression Quality ($60 - 98\%$) and Contrast Scale Multiplier ($5\text{x} - 35\text{x}$).
4. **Metadata Inspector Tab**:
   - Dedicated cards for Camera/Hardware, Timestamps, and GPS Geolocation.
   - Missing fields audit badges.
   - Sanitized raw EXIF key-value table.
5. **Downloadable Visualizations**: Derived ELA JPG files can be downloaded directly for inclusion in judicial discovery filings.
6. **Analysis History**: Persists and displays previous runs with exact quality/scale settings and examiner badges.
