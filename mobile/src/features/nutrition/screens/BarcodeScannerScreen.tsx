import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, SafeAreaView } from 'react-native';
import { Flashlight, Keyboard, X } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { useTheme } from '@/hooks/use-theme';
import { barcodeProduct } from '../data/foodsMock';
import type { MealType } from '../types/nutrition';

export function BarcodeScannerScreen() {
  const { colors } = useTheme();
  const { goBack, replace } = useNavigation();
  const params = useRouteParams<{ meal?: MealType }>();
  const meal = params.meal ?? 'snacks';

  const [found, setFound] = useState(false);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Scan line animation
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    ).start();

    const t = setTimeout(() => setFound(true), 2600);
    return () => clearTimeout(t);
  }, [scanAnim]);

  const lookup = () => {
    if (code.trim().length >= 8) {
      setManual(false);
      setFound(true);
    } else {
      setNotFound(true);
    }
  };

  const translateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 150],
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={goBack}
          style={styles.iconCircle}
          accessibilityLabel="Close scanner"
        >
          <X size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan barcode</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setTorchOn(!torchOn)}
          style={[styles.iconCircle, torchOn && { backgroundColor: 'rgba(255,255,255,0.35)' }]}
          accessibilityLabel="Toggle flashlight"
        >
          <Flashlight size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Viewfinder */}
      <View style={styles.viewfinderContainer}>
        <View style={styles.frame}>
          {!found && (
            <Animated.View
              style={[
                styles.scanLine,
                {
                  transform: [{ translateY }],
                  backgroundColor: colors.accent,
                },
              ]}
            />
          )}
        </View>
        <Text style={styles.statusText}>
          {found ? 'Barcode detected' : 'Line up the barcode inside the frame'}
        </Text>
        <Text style={styles.subText}>Camera preview is simulated in this prototype.</Text>
      </View>

      {/* Manual Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setManual(true)}
          style={styles.manualBtn}
        >
          <Keyboard size={18} color="#FFFFFF" />
          <Text style={styles.manualText}>Enter barcode manually</Text>
        </TouchableOpacity>
      </View>

      {/* Found Product Sheet */}
      <BottomSheet
        open={found}
        onClose={() => setFound(false)}
        title={barcodeProduct.name}
        description={`${barcodeProduct.brand} · ${barcodeProduct.serving}`}
        footer={
          <Button
            size="lg"
            fullWidth
            onPress={() =>
              replace('foodDetail', { id: barcodeProduct.id, meal, source: 'barcode' })
            }
          >
            Review & add
          </Button>
        }
      >
        <View style={[styles.productGrid, { backgroundColor: colors.surface2 }]}>
          {[
            ['kcal', barcodeProduct.kcal],
            ['Protein', `${barcodeProduct.protein}g`],
            ['Carbs', `${barcodeProduct.carbs}g`],
            ['Fat', `${barcodeProduct.fat}g`],
          ].map(([label, val]) => (
            <View key={String(label)} style={styles.gridItem}>
              <Text style={[styles.gridLabel, { color: colors.muted }]}>{label}</Text>
              <Text style={[styles.gridVal, { color: colors.ink }]}>{val}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.gridFootnote, { color: colors.muted }]}>
          Values from the product label database.
        </Text>
      </BottomSheet>

      {/* Manual Entry Sheet */}
      <BottomSheet
        open={manual}
        onClose={() => setManual(false)}
        title="Enter barcode"
        footer={
          <Button size="lg" fullWidth onPress={lookup}>
            Look up
          </Button>
        }
      >
        <TextField
          label="Barcode number"
          keyboardType="numeric"
          placeholder="13 digits"
          value={code}
          onChangeText={(t) => {
            setCode(t.replace(/\D/g, ''));
            setNotFound(false);
          }}
          error={
            notFound
              ? 'We couldn’t find that product. Check the number or search by name.'
              : undefined
          }
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  frame: {
    width: 280,
    height: 180,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    overflow: 'hidden',
    position: 'relative',
  },
  scanLine: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 3,
    borderRadius: 2,
  },
  statusText: {
    marginTop: 24,
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
  },
  subText: {
    marginTop: 6,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  manualBtn: {
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  manualText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  productGrid: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 14,
    justifyContent: 'space-around',
  },
  gridItem: {
    alignItems: 'center',
    gap: 2,
  },
  gridLabel: {
    fontSize: 11,
  },
  gridVal: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  gridFootnote: {
    marginTop: 10,
    fontSize: 12.5,
  },
});
