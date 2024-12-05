mod ffi;

use std::{io::Cursor, mem::MaybeUninit};

use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = decodeHca)]
pub unsafe fn decode_hca(buffer: &[u8], mut keycode: u64, subkey: u16) -> Result<Vec<u8>, JsError> {
    if buffer.len() < 8 {
        return Err(JsError::new("Invalid HCA data: Size too small"));
    }
    let buf_ptr = buffer.as_ptr() as _;

    let header_size = ffi::clHCA_isOurFile(buf_ptr, 8);
    if header_size < 0 || header_size > 0x1000 || header_size as usize > buffer.len() {
        return Err(JsError::new(&format!("Invalid header size: {}", header_size)));
    }

    let mut hca = Box::new(MaybeUninit::<ffi::clHCA>::zeroed().assume_init());
    let mut status = ffi::clHCA_DecodeHeader(hca.as_mut(), buf_ptr, header_size as u32);
    if status < 0 {
        return Err(JsError::new(&format!("Unsupported HCA header ({})", status)));
    }

    if subkey != 0 {
        (keycode, _) = keycode.overflowing_mul(((subkey as u64) << 16) | (!subkey + 2) as u64);
    }
    ffi::clHCA_SetKey(hca.as_mut(), keycode);

    let mut info = MaybeUninit::<ffi::clHCA_stInfo>::zeroed().assume_init();
    status = ffi::clHCA_getInfo(hca.as_mut(), &mut info);
    if status < 0 {
        return Err(JsError::new(&format!("Failed to extract HCA header info ({})", status)));
    }

    let mut wav_buffer: Cursor<Vec<u8>> = Cursor::new(Vec::new());
    let mut wav_writer = hound::WavWriter::new(&mut wav_buffer, hound::WavSpec {
        channels: info.channelCount as u16,
        sample_rate: info.samplingRate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    })?;

    let mut samples_buffer = vec![0i16; info.samplesPerBlock as usize * info.channelCount as usize];
    let samples_to_do = info.blockCount * info.samplesPerBlock - info.encoderDelay - info.encoderPadding;
    let mut samples_done = 0u32;
    let mut samples_filled = 0u32;
    let mut samples_to_discard = info.encoderDelay;
    let mut samples_consumed = 0u32;
    let mut current_block = 0u32;
    let mut wav_writer16 = wav_writer.get_i16_writer(samples_to_do * info.channelCount);
    while samples_done < samples_to_do {
        if samples_filled != 0 {
            let consumed = if samples_to_discard != 0 {
                // discard samples for looping
                let val = samples_filled.min(samples_to_discard);
                samples_to_discard -= val;
                val
            }
            else {
                let samples_to_get = samples_filled.min(samples_to_do - samples_done);
                let start = samples_consumed as usize * info.channelCount as usize;
                let end = start + samples_to_get as usize * info.channelCount as usize;
                for s in &samples_buffer[start..end] {
                    // SAFETY: no more than `samples_to_do` is ever written
                    wav_writer16.write_sample_unchecked(*s);
                }

                samples_done += samples_to_get;
                samples_to_get
            };

            // mark consumed samples
            samples_consumed += consumed;
            samples_filled -= consumed;
        }
        else {
            if current_block >= info.blockCount {
                return Err(JsError::new("Unable to fully decode HCA: Unexpected EOF"));
            }

            // read frame
            let start = info.headerSize as usize + current_block as usize * info.blockSize as usize;
            let end = start + info.blockSize as usize;
            let block_data = &buffer[start..end];
            current_block += 1;

            // decode frame
            status = ffi::clHCA_DecodeBlock(hca.as_mut(), block_data.as_ptr() as _, info.blockSize);
            if status < 0 {
                return Err(JsError::new(&format!("Failed to decode HCA block {} ({})", current_block, status)));
            }

            // extract samples
            ffi::clHCA_ReadSamples16(hca.as_mut(), samples_buffer.as_mut_ptr());

            samples_consumed = 0;
            samples_filled += info.samplesPerBlock;
        }
    }

    wav_writer16.flush()?;
    wav_writer.finalize()?;
    Ok(wav_buffer.into_inner())
}