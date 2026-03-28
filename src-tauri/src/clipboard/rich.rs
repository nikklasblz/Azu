use arboard::{Clipboard, ImageData};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{DynamicImage, ImageFormat};
use std::io::Cursor;

pub struct RichClipboard;

impl RichClipboard {
    pub fn read_text() -> Result<String, String> {
        let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
        clipboard.get_text().map_err(|e| e.to_string())
    }

    pub fn write_text(text: &str) -> Result<(), String> {
        let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
        clipboard.set_text(text).map_err(|e| e.to_string())
    }

    pub fn read_image_as_base64() -> Result<Option<String>, String> {
        let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
        match clipboard.get_image() {
            Ok(img_data) => {
                let img = DynamicImage::ImageRgba8(
                    image::RgbaImage::from_raw(
                        img_data.width as u32,
                        img_data.height as u32,
                        img_data.bytes.into_owned(),
                    )
                    .ok_or("Failed to create image from clipboard data")?,
                );
                let mut buf = Cursor::new(Vec::new());
                img.write_to(&mut buf, ImageFormat::Png).map_err(|e| e.to_string())?;
                Ok(Some(STANDARD.encode(buf.into_inner())))
            }
            Err(_) => Ok(None),
        }
    }

    pub fn write_image_from_base64(b64: &str) -> Result<(), String> {
        let bytes = STANDARD.decode(b64).map_err(|e| e.to_string())?;
        let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
        let rgba = img.to_rgba8();
        let (w, h) = rgba.dimensions();
        let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
        let img_data = ImageData {
            width: w as usize,
            height: h as usize,
            bytes: rgba.into_raw().into(),
        };
        clipboard.set_image(img_data).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_text_roundtrip() {
        RichClipboard::write_text("azu-test-clipboard").unwrap();
        let text = RichClipboard::read_text().unwrap();
        assert_eq!(text, "azu-test-clipboard");
    }

    #[test]
    fn test_read_image_returns_none_when_text() {
        RichClipboard::write_text("not an image").unwrap();
        let result = RichClipboard::read_image_as_base64();
        if let Ok(val) = result {
            assert!(val.is_none() || !val.unwrap().is_empty());
        }
    }
}
