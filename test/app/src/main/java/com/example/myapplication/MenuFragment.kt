package com.example.myapplication

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import android.widget.Toast
import androidx.navigation.fragment.findNavController
import com.example.myapplication.databinding.FragmentMenuBinding

class MenuFragment : Fragment() {
    private var _binding: FragmentMenuBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMenuBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.btnUpgrade.setOnClickListener {
            Toast.makeText(requireContext(), "멤버십 업그레이드", Toast.LENGTH_SHORT).show()
        }
        binding.switchNotif.setOnCheckedChangeListener { _, isChecked ->
            Toast.makeText(requireContext(), if (isChecked) "알림 켜짐" else "알림 꺼짐", Toast.LENGTH_SHORT).show()
        }
        binding.switchDark.setOnCheckedChangeListener { _, isChecked ->
            Toast.makeText(requireContext(), if (isChecked) "다크 모드 켜짐 (UI 적용 필요)" else "다크 모드 꺼짐", Toast.LENGTH_SHORT).show()
        }

        binding.navCoupons.setOnClickListener { findNavController().navigate(R.id.couponsFragment) }
        binding.navPayment.setOnClickListener { findNavController().navigate(R.id.paymentFragment) }
        binding.navSettings.setOnClickListener { findNavController().navigate(R.id.settingsFragment) }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

