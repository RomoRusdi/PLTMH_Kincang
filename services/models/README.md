# Model AI

Folder ini berisi model dari AI Engineer yang dijalankan worker prediksi
(`npm run predict`, lihat README services bagian *Prediksi AI*).

| File | Isi |
|---|---|
| `lstm_kincang.onnx` | Model LSTM PLTMH Kincang, masukan `[1, 60, 4]`, keluaran 5 langkah daya ternormalisasi |
| `lstm_kincang.json` | Metadata model (contoh di bawah) |

## Format metadata

```json
{
  "model": "LSTM",
  "version": "2026-11-16",
  "features": ["level_m", "kecepatan_aliran_ms", "debit_m3s", "jarak_udara_m"],
  "target": "daya_estimasi_kw",
  "lookback": 60,
  "horizon": 5,
  "interval_s": 60,
  "x_min": [0, 0, 0, 0],
  "x_max": [1, 1, 1, 1],
  "y_min": 0,
  "y_max": 320,
  "data_latih": ["2026-11-10 00:00", "2026-11-11 00:00"],
  "uji": { "mae": null, "rmse": null, "mape": null }
}
```

- `features` harus berurutan sama dengan kolom masukan saat model dilatih, dan
  tiap nama harus dipetakan ke tag di `config/predict-kincang.json`.
- `x_min`/`x_max` = `data_min_`/`data_max_` MinMaxScaler fitur (satu angka per
  fitur). `y_min`/`y_max` = MinMaxScaler target.
- Ganti `version` setiap model dilatih ulang, agar prediksi dan akurasi versi
  lama dan baru tercatat terpisah di database.

## Membuat file dari Google Colab

Jalankan di akhir notebook pelatihan; sesuaikan nama variabel model dan scaler.

```python
!pip install -q tf2onnx onnx
import json

model_lstm.export("lstm_savedmodel")   # Keras 3; Keras 2: tf.saved_model.save(model_lstm, "lstm_savedmodel")
!python -m tf2onnx.convert --saved-model lstm_savedmodel --output lstm_kincang.onnx --opset 13

meta = {
  "model": "LSTM", "version": "2026-11-16",
  "features": ["level_m", "kecepatan_aliran_ms", "debit_m3s", "jarak_udara_m"],
  "target": "daya_estimasi_kw", "lookback": 60, "horizon": 5, "interval_s": 60,
  "x_min": scaler_x.data_min_.tolist(), "x_max": scaler_x.data_max_.tolist(),
  "y_min": float(scaler_y.data_min_[0]), "y_max": float(scaler_y.data_max_[0]),
}
json.dump(meta, open("lstm_kincang.json", "w"), indent=2)
```
